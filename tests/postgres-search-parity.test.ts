import { describe, expect, it } from 'vitest';
import {
  escapePostgresLike,
  normalizePostgresSearch,
  postgresContainsPattern,
} from '@/lib/db/postgres-search';

describe('PostgreSQL search normalization', () => {
  it('normalizes Latin and Japanese compatibility characters', () => {
    expect(normalizePostgresSearch('ＳＴＵＤＩＯ　X')).toBe('studio x');
    expect(normalizePostgresSearch('夜が来る！')).toBe('夜が来る!');
    expect(normalizePostgresSearch('CAFÉ')).toBe('café');
  });

  it('escapes every LIKE metacharacter without changing regular text', () => {
    expect(escapePostgresLike('A%_\\B')).toBe('A\\%\\_\\\\B');
    expect(escapePostgresLike('Studio')).toBe('Studio');
  });

  it('builds a normalized escaped substring pattern', () => {
    expect(postgresContainsPattern(' Ａ%_\\Ｂ ')).toBe('% a\\%\\_\\\\b %');
  });
});
