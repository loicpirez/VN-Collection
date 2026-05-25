import { describe, expect, it } from 'vitest';
import { formatIsoDateString, formatVndbDateString } from '@/lib/locale-number';

describe('locale date formatting', () => {
  it('formats VNDB partial dates without inventing missing precision', () => {
    expect(formatVndbDateString('2020', 'en')).toBe('2020');
    expect(formatVndbDateString('2020-05', 'en')).toBe('May 2020');
    expect(formatVndbDateString('2020-05-21', 'en')).toBe('May 21, 2020');
  });

  it('formats the same full date differently by locale without timezone drift', () => {
    expect(formatIsoDateString('2020-05-21', 'fr')).toContain('2020');
    expect(formatIsoDateString('2020-05-21', 'ja')).toContain('2020');
    expect(formatIsoDateString('2020-05-21', 'en')).toBe('May 21, 2020');
  });
});
