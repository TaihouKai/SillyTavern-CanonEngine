// HM01–HM02: a message the user hid (ST sets is_system) stays part of the story; real system messages do not.
import { describe, expect, it } from 'vitest';
import { isGenuineSystem } from '../../src/adapters/st';

describe('hidden messages', () => {
  it('HM01 hidden player and GM messages are not system messages', () => {
    expect(isGenuineSystem({ is_user: true, is_system: true, mes: 'I walk.' })).toBe(false);
    expect(isGenuineSystem({ is_user: false, is_system: true, mes: 'The harbor.', extra: { canonEngine: { mid: 'msg_1', vid: 'var_1' } } })).toBe(false);
    // a legacy GM reply without a Canon id: it has the generating API / swipes
    expect(isGenuineSystem({ is_user: false, is_system: true, mes: 'The harbor.', swipes: ['The harbor.'], extra: { api: 'openai', model: 'x' } })).toBe(false);
    expect(isGenuineSystem({ is_user: false, is_system: false, mes: 'x' })).toBe(false);
  });

  it('HM02 real system messages stay system messages', () => {
    expect(isGenuineSystem({ is_user: false, is_system: true, name: 'SillyTavern System', mes: 'help' })).toBe(true);
    expect(isGenuineSystem({ is_user: false, is_system: true, name: 'Note', mes: 'a comment', extra: { type: 'comment' } })).toBe(true);
    expect(isGenuineSystem({ is_user: false, is_system: true, mes: 'narration', extra: { type: 'narrator' } })).toBe(true);
    expect(isGenuineSystem({ is_user: false, is_system: true, mes: 'tool', extra: { isSmallSys: true, tool_invocations: [] } })).toBe(true);
    expect(isGenuineSystem({ is_user: false, is_system: true, mes: 'bare' })).toBe(true);
  });
});
