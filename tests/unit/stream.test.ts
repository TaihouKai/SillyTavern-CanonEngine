// SR01–SR04: Canon's own requests to a custom endpoint are streamed to the provider (so a slow
// reasoning model does not hit a gateway timeout) and folded back into one ordinary completion.
import { describe, expect, it } from 'vitest';
import { sseToCompletion, streamedBody, StModel } from '../../src/adapters/st';

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
      expect(model.takeUsage()).toMatchObject({ input: 1200, output: 30, calls: 1, unreported: 0 });
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
