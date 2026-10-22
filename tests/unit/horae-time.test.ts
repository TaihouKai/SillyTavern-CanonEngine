import { describe, expect, it } from 'vitest';
import { HoraeAdapter } from '../../src/adapters/horae';

const msg = (story_date: string, story_time: string, extra: Record<string, unknown> = {}) => ({ mes: '', horae_meta: { timestamp: { story_date, story_time }, ...extra } });

describe('Horae story time comes from one message', () => {
  it('HT1 a date without a clock time is not joined with an earlier message\'s time (live: "10/9 上午" + "21:30")', () => {
    const chat = [msg('2020/10/08', '20:00'), { mes: 'u' }, msg('2020/10/08', '21:30'), { mes: 'u' }, msg('2020/10/9 (五) 上午', ''), { mes: 'u' }, msg('', '')];
    expect(HoraeAdapter.latestTime(chat)).toEqual({ date: '2020/10/9 (五) 上午', time: undefined });
  });

  it('HT2 a time without a date keeps the last recorded date; a full timestamp is used as is', () => {
    expect(HoraeAdapter.latestTime([msg('2020/10/08', '20:00'), msg('', '21:10')])).toEqual({ date: '2020/10/08', time: '21:10' });
    expect(HoraeAdapter.latestTime([msg('2020/10/08', '20:00'), msg('2020/10/09', '10:30')])).toEqual({ date: '2020/10/09', time: '10:30' });
  });

  it('HT3 skipped messages and chats without Horae data give nothing', () => {
    expect(HoraeAdapter.latestTime([msg('2020/10/08', '20:00'), msg('2020/10/09', '23:00', { _skipHorae: true })])).toEqual({ date: '2020/10/08', time: '20:00' });
    expect(HoraeAdapter.latestTime([{ mes: 'a' }])).toEqual({ date: undefined, time: undefined });
  });
});
