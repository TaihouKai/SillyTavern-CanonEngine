// BK: a backup analysis connection takes over one task when the main one blocks it (a content-filter
// error), refuses it (no JSON at all) or answers with nothing; temporary trouble stays on the main one.
// User request: official DeepSeek for analysis (cheap) with Venice as the backup for NSFW refusals.
import { beforeEach, describe, expect, it } from 'vitest';
import { looksRefused, StModel } from '../../src/adapters/st';

type Reply = string | Error;
let replies: Record<string, Reply[]> = {};
let calls: { id: string; body: unknown; budget: number }[] = [];
(globalThis as any).SillyTavern = {
  getContext: () => ({
    ConnectionManagerRequestService: {
      getProfile: (id: string) => ({ name: id, model: 'm' }),
      sendRequest: async (id: string, _msgs: unknown, budget: number, _o: unknown, extra: { custom_include_body?: string }) => {
        calls.push({ id, body: extra.custom_include_body, budget });
        const r = replies[id].shift();
        if (r instanceof Error) throw r;
        return { content: r ?? '' };
      },
    },
  }),
};

function model(backup = 'venice') {
  const m = new StModel();
  m.taskProfileId = () => 'deepseek';
  m.taskExtraBody = () => 'thinking: {type: disabled}';
  m.taskBackupProfileId = () => backup;
  m.taskBackupExtraBody = () => 'venice_parameters: {disable_thinking: true}';
  return m;
}
const run = (m: StModel) => m.runTask('evaluate', [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }], { maxTokens: 1000 });

describe('backup analysis connection', () => {
  beforeEach(() => { replies = {}; calls = []; });

  it('BK1 a content-filter error or a refusal goes to the backup with its own parameters; the turn\'s usage lists it', async () => {
    const m = model();
    m.takeUsage();
    replies = { deepseek: [new Error('Content Exists Risk')], venice: ['{"decision":"accept"}'] };
    expect(await run(m)).toBe('{"decision":"accept"}');
    expect(calls.map((c) => [c.id, c.body])).toEqual([['deepseek', 'thinking: {type: disabled}'], ['venice', 'venice_parameters: {disable_thinking: true}']]);
    replies = { deepseek: ['抱歉，我无法处理这个请求。'], venice: ['{"ok":true}'] };
    expect(await run(m)).toBe('{"ok":true}');
    const u = m.takeUsage();
    expect(u.backup).toHaveLength(2);
    expect(u.backup![0]).toMatch(/^evaluate: error: .*Content Exists Risk/);
    expect(u.backup![1]).toMatch(/^evaluate: refused: "抱歉/);
    expect(m.takeUsage().backup).toBeUndefined();
  });

  it('BK2 empty replies: one larger try, then the backup; without a backup the old three tries', async () => {
    replies = { deepseek: ['', ''], venice: ['{"a":1}'] };
    expect(await run(model())).toBe('{"a":1}');
    expect(calls.map((c) => [c.id, c.budget])).toEqual([['deepseek', 1000], ['deepseek', 2000], ['venice', 1000]]);
    calls = [];
    replies = { deepseek: ['', '', ''] };
    await expect(run(model(''))).rejects.toThrow(/empty reply 3 times/);
    expect(calls).toHaveLength(3);
  });

  it('BK3 temporary trouble stays on the main connection (retried by the caller); a good answer never touches the backup; both failing says so', async () => {
    replies = { deepseek: [new Error('503 Service Unavailable')], venice: ['{}'] };
    await expect(run(model())).rejects.toThrow(/503/);
    expect(calls.map((c) => c.id)).toEqual(['deepseek']);
    calls = [];
    replies = { deepseek: ['Here: {"a":1}'], venice: [] };
    expect(await run(model())).toBe('Here: {"a":1}');
    expect(calls.map((c) => c.id)).toEqual(['deepseek']);
    replies = { deepseek: [new Error('400 Content Exists Risk')], venice: [new Error('401 bad key')] };
    await expect(run(model())).rejects.toThrow(/main analysis connection failed \(error: .*Content Exists Risk.*\); the backup failed too: .*401 bad key/);
    // without a backup a refusal is returned as is (the caller's JSON repair handles it)
    replies = { deepseek: ['I cannot help with that.'] };
    expect(await run(model(''))).toBe('I cannot help with that.');
    expect(looksRefused('I cannot help with that.')).toBe(true);
    expect(looksRefused('```json\n[]\n```')).toBe(false);
  });
});
