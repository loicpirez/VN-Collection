import { describe, expect, it } from 'vitest';
import { formatMinutes } from '@/lib/format';
import { dictionaries } from '@/lib/i18n/dictionaries';

describe('formatMinutes', () => {
  it('uses localized hour and minute unit labels', () => {
    expect(formatMinutes(125, 'fr', dictionaries.fr.year)).toBe('2h 5min');
    expect(formatMinutes(125, 'en', dictionaries.en.year)).toBe('2h 5min');
    expect(formatMinutes(125, 'ja', dictionaries.ja.year)).toBe('2時間 5分');
  });

  it('respects fallback and zero-value options', () => {
    expect(formatMinutes(null, 'en', dictionaries.en.year, { fallback: 'empty' })).toBe('empty');
    expect(formatMinutes(0, 'en', dictionaries.en.year, { fallback: 'empty' })).toBe('empty');
    expect(formatMinutes(0, 'en', dictionaries.en.year, { emptyValue: 'allow_zero' })).toBe('0min');
  });
});
