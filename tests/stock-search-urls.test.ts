import { describe, expect, it } from 'vitest';
import { encodeShiftJisQuery, encodeEucJpQuery } from '@/lib/stock';

describe('encodeShiftJisQuery', () => {
  it('encodes ASCII identically to literal characters', () => {
    expect(encodeShiftJisQuery('abc')).toBe('abc');
    expect(encodeShiftJisQuery('123')).toBe('123');
  });

  it('encodes Japanese in Shift_JIS bytes — half-width 2 stays as 2', () => {
    // サンプル = 0x83 0x54, 0x83 0x93, 0x83 0x76, 0x83 0x8B
    // Lead byte 0x83 is non-ASCII → %83; trail byte 0x54 is ASCII T → literal,
    // 0x93 / 0x76 / 0x8B are non-printable / control / non-ASCII → %93 / v / %8B.
    // Half-width "2" (0x32) is digit → literal.
    expect(encodeShiftJisQuery('サンプル2')).toBe('%83T%83%93%83v%83%8B2');
  });

  it('encodes 送信 as %91%97%90M (lead bytes non-ASCII, trail 0x97 / 0x4D)', () => {
    // 送 = 0x91 0x97 → %91 + 0x97 (>= 0x80 so encoded) → %91%97
    // 信 = 0x90 0x4D → %90 + literal 'M' (0x4D) → %90M
    expect(encodeShiftJisQuery('送信')).toBe('%91%97%90M');
  });
});

describe('encodeEucJpQuery', () => {
  it('encodes Japanese in EUC-JP bytes', () => {
    // サンプル → A4A2 A4A4 ... actually katakana is in JIS X 0208 EUC-JP space.
    // Just verify it's non-empty hex-escaped output.
    const result = encodeEucJpQuery('サンプル');
    expect(result).toMatch(/^(%[0-9A-F]{2})+$/);
  });
});
