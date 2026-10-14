/**
 * OpenAI-compatible mock for Canon Engine end-to-end tests.
 *  - GM drafts (ST main connection): scripted queue / rules by user text.
 *  - Canon Engine internal tasks ([CANON_ENGINE_TASK:name]): scripted rules, otherwise
 *    deterministic defaults computed from the task input.
 *  - Horae background analyzer (aux API): rules by story text, delay/failure injection.
 *  - /v1/embeddings: deterministic hash vectors.
 * Every request is logged at GET /logs so tests can inspect the ACTUAL outgoing prompts.
 * Usage: node tests/e2e/mockServer.mjs [port]
 */
import http from 'node:http';

const PORT = Number(process.argv[2] || 5555);
const fresh = () => ({ logs: [], mainQueue: [], mainRules: [], taskRules: [], auxRules: [], auxDelayMs: 0, auxFailNext: 0, mainDelayMs: 0, taskDelayMs: 0, malformedNext: {}, emptyNext: {} });
let state = fresh();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isAux = (messages) => messages.some((m) => typeof m.content === 'string' && (m.content.includes('【Horae 后台状态分析器】') || m.content.includes('[Horae Background State Analyzer]')));
const taskOf = (messages) => { for (const m of messages) { const x = typeof m.content === 'string' && m.content.match(/\[CANON_ENGINE_TASK:([a-z_]+)\]/); if (x) return x[1]; } return null; };
const storyOf = (messages) => { const t = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n'); const m = t.match(/<story>\n?([\s\S]*?)\n?<\/story>/); return m ? m[1] : ''; };
const lastUser = (messages) => { for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return String(messages[i].content || ''); return ''; };

function taskInput(messages) {
  const u = messages.find((m) => m.role === 'user' && String(m.content).startsWith('INPUT'));
  if (!u) return {};
  try { return JSON.parse(String(u.content).replace(/^INPUT[^\n]*\n/, '')); } catch { return {}; }
}

const tickOf = (t) => (t ? t.day * 1440 + t.minute : 0);
const T = (tick) => ({ day: Math.floor(tick / 1440), minute: ((tick % 1440) + 1440) % 1440 });

function defaultTask(task, input) {
  switch (task) {
    case 'extract_user': return { statements: [], references: [], scene_entities: [] };
    case 'discover': return { references: [], claims: [] };
    case 'evaluate': {
      const now = input.current_time ? { day: input.current_time.day, minute: input.current_time.minute } : { day: 0, minute: 480 };
      return {
        decision: 'retain', scene_end: { lo: now, hi: now, precision: 'minute' }, flashback: false,
        claim_checks: (input.claims || []).map((c) => ({ claim_id: c.id, verdict: 'consistent', record_ids: [], note: '' })),
        transitions: [], occurrences: [], state_claims: [], player_actions: [], step_enactments: [], new_entities: [], violations: [],
        hard_checks: (input.due_hard || []).map((h) => ({ event_id: h.event_id, status: 'not_due', occurrence_ref: null, quote: null })), scene_entities: [], summary: '',
      };
    }
    case 'adjudicate': {
      const c = input.candidate || {};
      return { adjudications: c.id ? [{ event_id: c.id, decision: 'occurred', time: null, account: `Offscreen: ${c.title} happened (${c.required_description || c.original_summary}).`, actors: c.entities || [], causes: [], effects: (c.original_outcomes || []).map((o) => ({ op: 'set', entity_id: o.entity_id, predicate: o.predicate, value: o.value })), plan_step_ids: [], reason: 'mock adjudication', extraordinary: !!input.authorized_forced }] : [] };
    }
    case 'impact': return { changed: [], affected_anchors: [], affected_steps: [], scope: 'local', severity: 'none', replan: false, explanation: 'mock' };
    case 'plan': {
      const now = input.now?.tick ?? 0;
      const steps = (input.protected_hard_detailed || []).map((h, i) => {
        const lo = Math.max(now, tickOf(h.earliest) - 60);
        return { step_id: `s${i + 1}`, actors: [], targets: [], earliest: T(lo), latest: h.latest, prerequisites: [], action: `World actors move toward ${h.id}`, intended_effects: [], visibility: 'secret', knowers: [], depends_on: [], means: input.allowed_mode === 'FORCED_CONVERGENCE' ? 'extraordinary' : 'ordinary', serves_anchor: h.id, requires_player_consent: false };
      });
      return { rationale: 'mock plan', protected_anchor_ids: (input.protected_hard_detailed || []).map((h) => h.id), assumptions: [], risks: [], mode: input.allowed_mode || 'NORMAL', steps, inadequacy_note: input.forced_reason || '' };
    }
  }
  return {};
}

function deepMerge(base, patch) {
  if (Array.isArray(patch) || typeof patch !== 'object' || patch === null) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object' ? deepMerge(base[k], v) : v;
  return out;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
const completion = (content, model) => ({ id: 'mock-' + Date.now(), object: 'chat.completion', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
function streamCompletion(res, content, model) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
  for (const c of content.match(/[\s\S]{1,40}/g) || ['']) res.write(`data: ${JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: { content: c }, finish_reason: null }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}
function embed(text) {
  const dim = 64, v = new Array(dim).fill(0), s = String(text || '');
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); v[(c * 31 + (i % 7)) % dim] += 1; }
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / n);
}

/** rule: { task, match?: substring of the JSON input (or regex string /.../), response?: object, patch?: object, raw?: string, once?: boolean, delayMs?: number } */
function findRule(list, task, text) {
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r.task && r.task !== task) continue;
    const ok = !r.match || (r.match.startsWith('/') ? new RegExp(r.match.slice(1, -1)).test(text) : text.includes(r.match));
    const notOk = r.notMatch && text.includes(r.notMatch);
    if (ok && !notOk) { if (r.once) list.splice(i, 1); return r; }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  const url = req.url.replace(/^\/+/, '/');
  if (url === '/logs' && req.method === 'GET') return send(res, 200, state.logs);
  if (url === '/reset' && req.method === 'POST') { state = fresh(); return send(res, 200, { ok: true }); }
  if (url === '/control' && req.method === 'POST') {
    for (const k of Object.keys(fresh())) if (k !== 'logs' && body[k] !== undefined) state[k] = body[k];
    if (body.addTaskRules) state.taskRules.push(...body.addTaskRules);
    if (body.addMainRules) state.mainRules.push(...body.addMainRules);
    if (body.clearLogs) state.logs = [];
    return send(res, 200, { ok: true });
  }
  if (url.endsWith('/models')) return send(res, 200, { object: 'list', data: [{ id: 'mock-main', object: 'model' }, { id: 'mock-aux', object: 'model' }, { id: 'mock-embed', object: 'model' }] });
  if (url.endsWith('/embeddings')) {
    const input = Array.isArray(body.input) ? body.input : [body.input];
    state.logs.push({ type: 'embed', at: Date.now(), input });
    return send(res, 200, { object: 'list', data: input.map((t, i) => ({ object: 'embedding', index: i, embedding: embed(t) })), model: body.model || 'mock-embed' });
  }
  if (url.endsWith('/chat/completions')) {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (isAux(messages)) {
      const story = storyOf(messages);
      const entry = { type: 'aux', at: Date.now(), story, messages };
      state.logs.push(entry);
      if (state.auxDelayMs) await sleep(state.auxDelayMs);
      if (state.auxFailNext > 0) { state.auxFailNext--; return send(res, 500, { error: { message: 'mock aux failure' } }); }
      const rule = state.auxRules.find((r) => story.includes(r.match));
      return send(res, 200, completion(rule ? rule.response : '<horaenochange/>', body.model));
    }
    const task = taskOf(messages);
    if (task) {
      const input = taskInput(messages);
      const text = JSON.stringify(input);
      const entry = { type: 'task', task, at: Date.now(), messages, input, model: body.model, temperature: body.temperature, stream: !!body.stream };
      state.logs.push(entry);
      if (state.taskDelayMs) await sleep(state.taskDelayMs);
      const rule = findRule(state.taskRules, task, text);
      if (rule?.delayMs) await sleep(rule.delayMs);
      if ((state.emptyNext[task] || 0) > 0) { state.emptyNext[task]--; entry.response = ''; entry.maxTokens = body.max_tokens; return send(res, 200, completion('', body.model)); }
      if ((state.malformedNext[task] || 0) > 0) { state.malformedNext[task]--; entry.response = 'not json at all'; return send(res, 200, completion('Sure! Here is the analysis: not json at all', body.model)); }
      let out;
      if (rule?.raw !== undefined) out = rule.raw;
      else if (rule?.response) out = JSON.stringify(typeof rule.response === 'function' ? rule.response(input) : rule.response);
      else out = JSON.stringify(rule?.patch ? deepMerge(defaultTask(task, input), rule.patch) : defaultTask(task, input));
      entry.response = out;
      entry.rule = rule?.name || null;
      return send(res, 200, completion(out, body.model));
    }
    // GM draft (or any other main-connection request)
    const lu = lastUser(messages);
    const all = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
    let content;
    const rule = findRule(state.mainRules, null, all);
    if (rule) content = rule.response;
    else if (state.mainQueue.length) content = state.mainQueue.shift();
    else content = `默认叙事：GM 回应了「${lu.slice(0, 30)}」。`;
    state.logs.push({ type: 'main', at: Date.now(), messages, stream: !!body.stream, response: content, model: body.model, temperature: body.temperature });
    if (state.mainDelayMs) await sleep(state.mainDelayMs);
    if (body.stream) return streamCompletion(res, content, body.model);
    return send(res, 200, completion(content, body.model));
  }
  send(res, 404, { error: 'not found', url });
});
server.listen(PORT, () => console.log(`[mock] listening on http://127.0.0.1:${PORT}`));
