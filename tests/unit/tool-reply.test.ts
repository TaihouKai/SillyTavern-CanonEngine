// TR: a story reply the model gave as a tool call is read as the reply (src/hosts/sillytavern/st.ts toolCallReply).
// Live (2026-11-26, a user's preset): the preset made the model answer through a `mie_reply` tool; the draft came
// back with no text (finish tool_calls) and was taken for an empty reply.
import { describe, expect, it } from 'vitest';
import { sseToCompletion, toolCallReply } from '../../src/hosts/sillytavern/st';

const sse = (...chunks: unknown[]) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
const delta = (d: object, finish: string | null = null) => ({ id: 'x', model: 'm', choices: [{ index: 0, delta: d, finish_reason: finish }] });
const call = (args: string, name = 'mie_reply') => ({ tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: args } }] });

describe('a reply given as a tool call', () => {
  it('TR1 a streamed tool call is kept when the stream is folded', () => {
    const args = JSON.stringify({ think: '推理', story_scene: '<story_scene>\n徐空皱眉。\n</story_scene>', status: '晴' });
    const c = sseToCompletion(sse(
      delta({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'mie_reply', arguments: '' } }] }),
      delta({ tool_calls: [{ index: 0, function: { arguments: args.slice(0, 20) } }] }),
      delta({ tool_calls: [{ index: 0, function: { arguments: args.slice(20) } }] }),
      delta({}, 'tool_calls')));
    expect(c.choices[0].finish_reason).toBe('tool_calls');
    expect(c.choices[0].message.content).toBe('');
    expect(c.choices[0].message.tool_calls).toEqual([{ id: 'call_1', type: 'function', function: { name: 'mie_reply', arguments: args } }]);
  });

  it('TR2 several fields: each in a tag of its name (one already in its tag stays as is); thinking apart', () => {
    const r = toolCallReply(call(JSON.stringify({ think: '先想', story_scene: '<story_scene>\n徐空皱眉。\n</story_scene>', status: '晴', options: ['走', '留'] })))!;
    expect(r.text).toBe('<story_scene>\n徐空皱眉。\n</story_scene>\n\n<status>\n晴\n</status>\n\n<options>\n走\n留\n</options>');
    expect(r.reasoning).toBe('先想');
  });

  it('TR3 one text field: the text as it is', () => {
    expect(toolCallReply(call(JSON.stringify({ reply: '港口很安静。' })))).toEqual({ text: '港口很安静。', reasoning: '' });
  });

  it('TR4 arguments cut off mid-way are read as far as they go', () => {
    expect(toolCallReply(call('{"think":"想","story_scene":"徐空\\n皱眉，抬起'))!.text).toBe('徐空\n皱眉，抬起');
  });

  it('TR5 no tool call, or one with only thinking or nothing: not a reply', () => {
    expect(toolCallReply({ content: 'x' })).toBeNull();
    expect(toolCallReply(call(JSON.stringify({ think: '只有想法' })))).toBeNull();
    expect(toolCallReply(call('{}'))).toBeNull();
  });
});
