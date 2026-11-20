import { describe, expect, it } from 'vitest';
import { quoteInText } from '../../src/core/domain/util';

describe('evidence quotes', () => {
  const msg = '（夜里我抄近路穿过第七学区的背街小巷，两个染着黄毛的混混堵在巷口，伸手要钱。我没理他们，直接一拳打在领头那个的脸上。）';
  it('Q1 a quote verbatim (modulo whitespace) matches; one not in the text, or under two characters, does not', () => {
    expect(quoteInText('两个染着黄毛的混混堵在巷口', msg)).toBe(true);
    expect(quoteInText('三个混混', msg)).toBe(false);
    expect(quoteInText('我', msg)).toBe(false);
    expect(quoteInText('', msg)).toBe(false);
  });
  it('Q2 spans of the text joined by an ellipsis match when each is in it, in order (live: a fighter was dropped for it)', () => {
    expect(quoteInText('两个染着黄毛的混混堵在巷口，伸手要钱……直接一拳打在领头那个的脸上', msg)).toBe(true);
    expect(quoteInText('两个染着黄毛的混混...直接一拳', msg)).toBe(true);
    expect(quoteInText('直接一拳……两个染着黄毛的混混', msg)).toBe(false);   // out of order
    expect(quoteInText('两个染着黄毛的混混……三个人', msg)).toBe(false);       // a span not in it
    expect(quoteInText('两个染着黄毛的混混……拳', msg)).toBe(false);           // a span too short to tell
    expect(quoteInText('“你……你是', '他说：“你……你是谁？”')).toBe(true);     // the text's own ellipsis, verbatim
  });
});
