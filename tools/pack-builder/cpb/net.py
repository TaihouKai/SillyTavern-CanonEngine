"""Downloads with an on-disk cache, retries and a polite concurrency limit."""
import concurrent.futures as cf
import os
import time
import urllib.error
import urllib.request

from .util import log, warn

UA = 'canon-pack-builder/0.1 (+local tool; personal use)'


def get(url, path, refresh=False, tries=4, timeout=60):
    """Fetch url into path (kept if it exists unless refresh). Returns bytes, or None on a 404."""
    if not refresh and os.path.exists(path):
        with open(path, 'rb') as f:
            return f.read()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
            tmp = path + '.part'
            with open(tmp, 'wb') as f:
                f.write(data)
            os.replace(tmp, path)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last = e
        except Exception as e:  # network hiccup
            last = e
        time.sleep(1.5 * (i + 1))
    raise RuntimeError(f'download failed: {url}: {last}')


def get_many(jobs, workers=6, label='files'):
    """jobs: [(url, path)]. Downloads the missing ones in parallel; returns the number of 404s."""
    todo = [(u, p) for u, p in jobs if not os.path.exists(p)]
    if not todo:
        return 0
    log(f'downloading {len(todo)} {label} ({len(jobs) - len(todo)} cached)')
    missing = 0
    done = 0
    with cf.ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(get, u, p): u for u, p in todo}
        for f in cf.as_completed(futs):
            done += 1
            try:
                if f.result() is None:
                    missing += 1
                    warn('not found:', futs[f])
            except Exception as e:
                warn(str(e))
                missing += 1
            if done % 200 == 0:
                log(f'  {done}/{len(todo)}')
    return missing
