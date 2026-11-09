"""Model calls: an OpenAI-compatible client (DeepSeek by default), a result cache, cost accounting and a budget.

Every call is cached on disk by (model, task, prompt version, messages): re-running a step never pays twice, and
an interrupted run resumes where it stopped. A run stops before it spends more than llm.max_usd_per_run.
"""
import concurrent.futures as cf
import datetime as dt
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request

from .util import log, read_json, sha, warn, write_json


class BudgetExceeded(Exception):
    pass


class LLMError(Exception):
    pass


def is_peak(cfg, at=None):
    at = at or dt.datetime.now(dt.timezone.utc)
    op = cfg.get('offpeak') or {}
    if not op:
        return True
    if at.weekday() not in op.get('peak_weekdays', [0, 1, 2, 3, 4]):
        return False
    return any(a <= at.hour < b for a, b in op.get('peak_utc_hours', []))


def price_factor(cfg, at=None):
    op = cfg.get('offpeak') or {}
    return 1.0 if is_peak(cfg, at) else float(op.get('discount', 1.0))


def cost_of(cfg, usage, at=None):
    p = cfg.get('prices_usd_per_mtok') or {}
    prompt = usage.get('prompt_tokens') or 0
    hit = usage.get('prompt_cache_hit_tokens') or 0
    miss = usage.get('prompt_cache_miss_tokens')
    if miss is None:
        miss = max(0, prompt - hit)
    out = usage.get('completion_tokens') or 0
    return (hit * p.get('input_hit', 0) + miss * p.get('input_miss', 0) + out * p.get('output', 0)) / 1e6 * price_factor(cfg, at)


def extract_json(text):
    """The JSON object in a reply (tolerates a fenced block or prose around it)."""
    t = text.strip()
    m = re.search(r'```(?:json)?\s*(.*?)```', t, re.S)
    if m:
        t = m.group(1).strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        a, b = t.find('{'), t.rfind('}')
        if a >= 0 and b > a:
            return json.loads(t[a:b + 1])
        raise


class Ledger:
    """Spending of this run (cached results cost nothing)."""

    def __init__(self, cfg, path):
        self.cfg = cfg
        self.path = path
        self.lock = threading.Lock()
        self.usd = 0.0
        self.calls = 0
        self.cached = 0
        self.tokens_in = 0
        self.tokens_out = 0
        self.limit = float(cfg.get('max_usd_per_run') or 0) or None
        self.offpeak_only = False

    def check(self):
        if self.limit is not None and self.usd >= self.limit:
            raise BudgetExceeded(f'budget reached: ${self.usd:.3f} of ${self.limit:.2f} for this run (llm.max_usd_per_run)')
        if self.offpeak_only and is_peak(self.cfg):
            raise BudgetExceeded('peak hours began (--offpeak): stopped before paying the full price')

    def add(self, task, usage, usd):
        with self.lock:
            self.usd += usd
            self.calls += 1
            self.tokens_in += usage.get('prompt_tokens') or 0
            self.tokens_out += usage.get('completion_tokens') or 0
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(self.path, 'a', encoding='utf8') as f:
                f.write(json.dumps({'at': time.strftime('%Y-%m-%d %H:%M:%S'), 'task': task, 'usage': usage, 'usd': round(usd, 6)}, ensure_ascii=False) + '\n')

    def summary(self):
        return f'{self.calls} model calls (+{self.cached} cached), {self.tokens_in:,} tokens in / {self.tokens_out:,} out, ${self.usd:.4f}'


class Client:
    def __init__(self, cfg, project, mock=None):
        self.cfg = cfg
        self.project = project
        self.mock = mock
        self.ledger = Ledger(cfg, project.p('llm', 'usage.jsonl'))
        self.provider = 'mock' if mock else cfg.get('provider', 'openai_compatible')
        if self.provider != 'mock' and not cfg.get('api_key'):
            raise SystemExit('No API key: put it in config.json under llm.api_key (or set CPB_API_KEY).')

    @property
    def model(self):
        return 'mock' if self.mock else self.cfg.get('model')

    def _cache_path(self, task, key):
        return self.project.p('llm', task, key + '.json')

    def cached(self, task, version, messages):
        key = sha(self.model, task, version, messages)
        hit = read_json(self._cache_path(task, key))
        return key, hit

    def _post(self, messages, max_tokens, attempt=1):
        # a retry changes the conditions: live, DeepSeek Flash in JSON mode at low temperature answered a long
        # chapter with '{"summary":""}' every time; a warmer retry, or one without JSON mode, answered in full
        temp = self.cfg.get('temperature', 0.3) if attempt == 1 else max(0.7, self.cfg.get('temperature', 0.3))
        body = {'model': self.cfg['model'], 'messages': messages, 'temperature': temp, 'max_tokens': max_tokens, 'stream': False}
        if self.cfg.get('json_mode', True) and attempt < 3:
            body['response_format'] = {'type': 'json_object'}
        body.update(self.cfg.get('extra_body') or {})
        url = self.cfg['base_url'].rstrip('/') + '/chat/completions'
        req = urllib.request.Request(url, data=json.dumps(body).encode('utf8'), method='POST',
                                     headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + self.cfg['api_key']})
        with urllib.request.urlopen(req, timeout=self.cfg.get('timeout_s', 300)) as r:
            return json.loads(r.read().decode('utf8'))

    def call(self, task, version, system, user, check=None, max_tokens=None, json_mode=True):
        """One structured call. check(obj) returns a list of problems (empty = fine). Returns the object."""
        messages = [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]
        key, hit = self.cached(task, version, messages)
        if hit is not None:
            with self.ledger.lock:
                self.ledger.cached += 1
            return hit['result']
        if self.mock:
            result = self.mock(task, user)
            write_json(self._cache_path(task, key), {'task': task, 'version': version, 'model': 'mock', 'result': result})
            return result
        max_tokens = max_tokens or self.cfg.get('max_output_tokens', 8192)
        tries, transient, problems, last = 0, 0, [], None
        msgs = list(messages)
        while tries < 3:
            self.ledger.check()
            try:
                resp = self._post(msgs, max_tokens, tries + 1 if json_mode else 3)
            except urllib.error.HTTPError as e:
                detail = e.read().decode('utf8', 'replace')[:300]
                if e.code in (429, 500, 502, 503, 504) and transient < 6:
                    transient += 1
                    warn(f'{task}: HTTP {e.code}, retrying')
                    time.sleep(5 * transient)
                    last = f'HTTP {e.code}: {detail}'
                    continue
                raise LLMError(f'HTTP {e.code}: {detail}')
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
                if transient < 6:
                    transient += 1
                    warn(f'{task}: {e}, retrying')
                    time.sleep(5 * transient)
                    last = str(e)
                    continue
                raise LLMError(f'{task}: {e}')
            tries += 1
            usage = resp.get('usage') or {}
            self.ledger.add(task, usage, cost_of(self.cfg, usage))
            choice = (resp.get('choices') or [{}])[0]
            text = (choice.get('message') or {}).get('content') or ''
            finish = choice.get('finish_reason')
            try:
                obj = extract_json(text)
                problems = check(obj) if check else []
            except (json.JSONDecodeError, ValueError) as e:
                obj, problems = None, [f'not valid JSON ({e}){" — the reply was cut off at the output limit" if finish == "length" else ""}']
            if not problems:
                write_json(self._cache_path(task, key), {'task': task, 'version': version, 'model': self.model, 'usage': usage, 'result': obj})
                return obj
            last = '; '.join(problems)[:600]
            warn(f'{task}: reply rejected ({last[:200]}), asking again')
            write_json(self.project.p('llm', 'rejected', f'{task}-{key[:12]}-{tries}.json'), {'problems': problems, 'finish': finish, 'text': text})
            if len(text) < 200:
                msgs = list(messages)       # a near-empty reply: ask afresh, not "correct this"
            else:
                msgs = messages + [{'role': 'assistant', 'content': text[:4000]},
                                   {'role': 'user', 'content': 'Your reply had these problems: ' + last + '\nReply again with the complete corrected JSON object only.'}]
        raise LLMError(f'{task}: no usable reply after {tries} tries: {last}')

    def run_many(self, jobs, label):
        """jobs: [(name, fn)] run with the configured concurrency. Returns {name: result or Exception}."""
        out = {}
        n = len(jobs)
        if not n:
            return out
        workers = 1 if self.mock else int(self.cfg.get('concurrency', 4))
        done = 0
        stop = threading.Event()

        def wrap(fn):
            if stop.is_set():
                raise BudgetExceeded('stopped')
            return fn()
        with cf.ThreadPoolExecutor(workers) as ex:
            futs = {ex.submit(wrap, fn): name for name, fn in jobs}
            for f in cf.as_completed(futs):
                name = futs[f]
                done += 1
                try:
                    out[name] = f.result()
                except BudgetExceeded as e:
                    stop.set()
                    out[name] = e
                except Exception as e:
                    out[name] = e
                    warn(f'{label} {name}: {e}')
                if done % 10 == 0 or done == n:
                    log(f'  {label}: {done}/{n} — {self.ledger.summary()}')
        return out
