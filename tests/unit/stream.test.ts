// SR01–SR04: Canon's own requests to a custom endpoint are streamed to the provider (so a slow
// reasoning model does not hit a gateway timeout) and folded back into one ordinary completion.
import { describe, expect, it } from 'vitest';
import { sseToCompletion, streamedBody, StModel, costOf, deepseekCost, deepseekPeak, isDeepSeekOfficial } from '../../src/adapters/st';

const sse = (...chunks: unknown[]) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
const delta = (d: object, finish: string | null = null) => ({ id: 'x', model: 'm', choices: [{ index: 0, delta: d, finish_reason: finish }] });

describe('streamed requests', () => {
  it('SR01 an event stream folds into one completion with content, reasoning, finish reason and usage', () => {
    const c = sseToCompletion(sse(delta({ reasoning_content: 'think ' }), delta({ reasoning: 'more' }), delta({ content: '港口' }), delta({ content: '很安静' }), delta({}, 'length'),
      { id: 'x', choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    expect(c.choices[0].message).toEqual({ role: 'assistant', content: '港口很安静', reasoning_content: 'think more' });
    expect(c.choices[0].finish_reason).toBe('length');
    expect(c.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5 });
    expect(sseToCompletion(sse({ error: { message: 'boom' } }))).toEqual({ error: { message: 'boom' } });
    expect(sseToCompletion('{"choices":[]}')).toBeNull(); // not a stream
  });

  it('CO1 the provider-reported cost is read from Venice, unlid and OpenRouter style responses, and kept when a stream is folded', () => {
    expect(costOf({ cost: { usd: 0.000235424, diem: 0 } })).toEqual({ usd: 0.000235424, diem: 0 }); // Venice
    expect(costOf({ unlid: { cost_usd: 0.023881 } })).toEqual({ usd: 0.023881, diem: 0 }); // unlid
    expect(costOf({ usage: { cost: 0.0042 } })).toEqual({ usd: 0.0042, diem: 0 }); // OpenRouter
    expect(costOf({ cost: { usd: 0, diem: 0.5 } })).toEqual({ usd: 0, diem: 0.5 }); // paid in DIEM
    expect(costOf({ usage: { prompt_tokens: 3 } })).toEqual({ usd: null, diem: 0 }); // not reported
    const c = sseToCompletion(sse(delta({ content: 'x' }, 'stop'), { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 }, cost: { usd: 0.01, diem: 0 }, unlid: { cost_usd: 0.02 } }));
    expect(c.cost).toEqual({ usd: 0.01, diem: 0 });
    expect(c.unlid).toEqual({ cost_usd: 0.02 });
  });

  it('SR02 only non-streamed custom-endpoint requests are switched, and usage is asked for once', () => {
    const b = (o: object) => JSON.stringify({ stream: false, chat_completion_source: 'custom', ...o });
    expect(JSON.parse(streamedBody(b({ custom_include_body: '' }))!)).toMatchObject({ stream: true, custom_include_body: 'stream_options:\n  include_usage: true' });
    expect(JSON.parse(streamedBody(b({ custom_include_body: 'reasoning_effort: high\n' }))!).custom_include_body).toBe('reasoning_effort: high\nstream_options:\n  include_usage: true');
    expect(JSON.parse(streamedBody(b({ custom_include_body: 'stream_options:\n  include_usage: false' }))!).custom_include_body).toBe('stream_options:\n  include_usage: false');
    expect(JSON.parse(streamedBody(b({ custom_include_body: '{"a": 1}' }))!).custom_include_body).toBe('{"a": 1}'); // not appended to a flow mapping
    expect(streamedBody(b({ chat_completion_source: 'openai' }))).toBeNull();
    expect(streamedBody(b({ stream: true }))).toBeNull();
    expect(streamedBody('not json')).toBeNull();
  });

  describe('the fetch tap', () => {
    const sent: any[] = [];
    let handler: (body: any) => Response = () => new Response('{}');
    (globalThis as any).window = { fetch: async (_u: string, init: RequestInit) => { const b = JSON.parse(String(init.body)); sent.push(b); return handler(b); } };
    const model = new StModel();
    const url = '/api/backends/chat-completions/generate';
    const req = (tag = '[CANON_ENGINE_TASK:evaluate]') => (globalThis as any).window.fetch(url, { method: 'POST', body: JSON.stringify({ stream: false, chat_completion_source: 'custom', custom_include_body: '', messages: [{ role: 'user', content: tag }] }) });

    it('SR03 ST receives one ordinary completion and the tokens are counted from the usage chunk', async () => {
      sent.length = 0; model.takeUsage();
      handler = (b) => new Response(b.stream ? sse(delta({ content: '{"decision":"accept"}' }, 'stop'), { choices: [], usage: { prompt_tokens: 1200, completion_tokens: 30 } }) : '{}', { status: 200 });
      const res = await req();
      const d = await res.json();
      expect(sent).toHaveLength(1);
      expect(sent[0].stream).toBe(true);
      expect(d.choices[0].message.content).toBe('{"decision":"accept"}');
      await new Promise((r) => setTimeout(r, 0));
      expect(model.takeUsage()).toMatchObject({ input: 1200, output: 30, calls: 1, unreported: 0, costUnreported: 1 });
    });

    it('CO2 the cost of every call in the turn is summed, the story model share kept apart; calls without a cost are counted', async () => {
      model.takeUsage();
      handler = (b) => new Response(sse(delta({ content: 'ok' }, 'stop'), { choices: [], usage: { prompt_tokens: 100, completion_tokens: 10 }, unlid: { cost_usd: b.messages[0].content.includes('[CANON ENGINE CONTEXT') ? 0.02 : 0.003 } }), { status: 200 });
      await (await req('[CANON ENGINE CONTEXT x]')).json(); // story draft
      await (await req()).json(); // analysis
      await (await req()).json();
      handler = () => new Response(sse(delta({ content: 'ok' }, 'stop'), { choices: [], usage: { prompt_tokens: 100, completion_tokens: 10 } }), { status: 200 });
      await (await req()).json(); // a call without a cost
      await new Promise((r) => setTimeout(r, 0));
      const u = model.takeUsage();
      expect(u.costUsd).toBeCloseTo(0.026, 10);
      expect(u.storyCostUsd).toBeCloseTo(0.02, 10);
      expect(u.costUnreported).toBe(1);
      expect(model.takeUsage().costUsd).toBe(0); // reset per turn
    });

    it("DS1 DeepSeek's official API (no cost in the response) is priced from its published rates: custom endpoint api.deepseek.com or ST's DeepSeek source", async () => {
      const ds = (src: object, model: string) => (globalThis as any).window.fetch(url, { method: 'POST', body: JSON.stringify({ stream: false, custom_include_body: '', model, messages: [{ role: 'user', content: '[CANON_ENGINE_TASK:evaluate]' }], ...src }) });
      const usage = { prompt_tokens: 50000, prompt_cache_hit_tokens: 40000, prompt_cache_miss_tokens: 10000, completion_tokens: 2000 };
      handler = (b) => new Response(b.stream ? sse(delta({ content: 'ok' }, 'stop'), { choices: [], usage }) : JSON.stringify({ model: b.model, choices: [{ message: { content: 'ok' } }], usage }), { status: 200 });
      const k = deepseekPeak(new Date()) ? 1 : 0.5;
      model.takeUsage();
      await (await ds({ chat_completion_source: 'custom', custom_url: 'https://api.deepseek.com' }, 'deepseek-flash')).json();
      await new Promise((r) => setTimeout(r, 0));
      expect(model.takeUsage().costUsd).toBeCloseTo(k * (40000 * 0.006 + 10000 * 0.3 + 2000 * 1.2) / 1e6, 12);
      await (await ds({ chat_completion_source: 'deepseek' }, 'deepseek-v4-pro')).json();
      await new Promise((r) => setTimeout(r, 0));
      expect(model.takeUsage().costUsd).toBeCloseTo(k * (40000 * 0.044 + 10000 * 1.32 + 2000 * 3.96) / 1e6, 12);
      // another provider without a cost is still "no cost reported", not priced as DeepSeek
      await (await ds({ chat_completion_source: 'custom', custom_url: 'https://api.example.com/v1' }, 'deepseek-flash')).json();
      await new Promise((r) => setTimeout(r, 0));
      expect(model.takeUsage()).toMatchObject({ costUsd: 0, costUnreported: 1 });
    });

    it('DS2 peak hours are 01-04 and 06-10 UTC on weekdays; off-peak is half', () => {
      expect(deepseekPeak(new Date('2026-10-21T02:30:00Z'))).toBe(true); // Wednesday
      expect(deepseekPeak(new Date('2026-10-21T04:30:00Z'))).toBe(false);
      expect(deepseekPeak(new Date('2026-10-21T09:59:00Z'))).toBe(true);
      expect(deepseekPeak(new Date('2026-10-24T02:30:00Z'))).toBe(false); // Saturday
      const u = { prompt_tokens: 1e6, prompt_cache_miss_tokens: 1e6, completion_tokens: 0 };
      expect(deepseekCost('deepseek-flash', u, new Date('2026-10-21T02:30:00Z'))).toBeCloseTo(0.3, 10);
      expect(deepseekCost('deepseek-flash', u, new Date('2026-10-21T12:00:00Z'))).toBeCloseTo(0.15, 10);
      expect(deepseekCost('deepseek-flash', {}, new Date())).toBeNull();
      expect(isDeepSeekOfficial({ chat_completion_source: 'custom', custom_url: 'api.deepseek.com/v1' })).toBe(true);
      expect(isDeepSeekOfficial({ chat_completion_source: 'custom', custom_url: 'https://api.deepseek.com.evil.io' })).toBe(false);
    });

    it('SR05 a stream that goes silent without closing is given up after the stall time, with a clear reason; steady slow streams are not', async () => {
      (globalThis as any).__canonStreamStallMs = 150;
      const enc = new TextEncoder();
      try {
        // one chunk, then silence (the connection never closes)
        handler = () => new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(`data: ${JSON.stringify(delta({ reasoning_content: 'thinking' }))}\n\n`)); } }), { status: 200 });
        await expect(req('[CANON ENGINE CONTEXT x]')).rejects.toThrow(/sent nothing for 0s \(in the middle of the reply\); the connection stalled/);
        // the provider never even starts
        handler = () => new Promise(() => {}) as any;
        await expect(req()).rejects.toThrow(/waiting for the provider to start the reply/);
        // a slow model that keeps sending (every 60 ms for ~0.5 s) is never cut off
        handler = () => new Response(new ReadableStream({ async start(c) {
          for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 60)); c.enqueue(enc.encode(`data: ${JSON.stringify(delta({ content: 'x' }))}\n\n`)); }
          c.enqueue(enc.encode('data: [DONE]\n\n')); c.close();
        } }), { status: 200 });
        expect((await (await req()).json()).choices[0].message.content).toBe('xxxxxxxx');
      } finally { delete (globalThis as any).__canonStreamStallMs; }
    });

    it('SR04 a provider that refuses the streamed request (4xx) gets the request as ST sent it; a 5xx is reported, not repeated', async () => {
      sent.length = 0;
      handler = (b) => b.stream ? new Response('{"error":"stream_options not allowed"}', { status: 400 }) : new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
      expect((await (await req()).json()).choices[0].message.content).toBe('ok');
      expect(sent.map((b) => b.stream)).toEqual([true, false]);
      sent.length = 0;
      handler = () => new Response('', { status: 504, statusText: 'Gateway Timeout' });
      expect((await req()).status).toBe(504);
      expect(sent).toHaveLength(1);
      // requests that are not Canon's go out untouched
      sent.length = 0;
      handler = () => new Response('{}');
      await (globalThis as any).window.fetch(url, { method: 'POST', body: JSON.stringify({ stream: false, chat_completion_source: 'custom', messages: [{ role: 'user', content: 'hello' }] }) });
      expect(sent[0].stream).toBe(false);
    });
  });
});
