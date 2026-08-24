import { describe, expect, it } from 'vitest';
import { normalizeDatabaseError } from '@/lib/db/errors';

const codedError = (code: string): Error & { code: string } => Object.assign(new Error('sensitive database detail'), { code });

describe('PostgreSQL error normalization', () => {
  it('leaves values without a driver code unclassified', () => {
    expect(normalizeDatabaseError(null)).toBeNull();
    expect(normalizeDatabaseError(new Error('ordinary failure'))).toBeNull();
    expect(normalizeDatabaseError({ code: 23505 })).toBeNull();
    expect(normalizeDatabaseError({ code: '' })).toBeNull();
    expect(normalizeDatabaseError({ code: 'not-a-database-code' })).toBeNull();
  });

  it('normalizes unique and foreign-key violations as conflicts', () => {
    expect(normalizeDatabaseError(codedError('23505'))).toEqual({
      code: 'db_unique_conflict', status: 409, message: 'database conflict',
    });
    expect(normalizeDatabaseError(codedError('23503'))).toEqual({
      code: 'db_reference_conflict', status: 409, message: 'related record conflict',
    });
  });

  it('normalizes serialization failures and deadlocks as retryable conflicts', () => {
    expect(normalizeDatabaseError(codedError('40001'))?.code).toBe('db_retryable_conflict');
    expect(normalizeDatabaseError(codedError('40p01'))).toEqual({
      code: 'db_retryable_conflict', status: 409, message: 'database operation must be retried',
    });
  });

  it('normalizes query cancellation and lock timeout without leaking details', () => {
    expect(normalizeDatabaseError(codedError('57014'))?.code).toBe('db_timeout');
    expect(normalizeDatabaseError(codedError('55P03'))).toEqual({
      code: 'db_timeout', status: 503, message: 'database request timed out',
    });
  });

  it('normalizes SQLSTATE and socket availability failures', () => {
    for (const code of ['08000', '08006', '57P01', '57P02', '57P03', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'ETIMEDOUT']) {
      expect(normalizeDatabaseError(codedError(code))).toEqual({
        code: 'db_unavailable', status: 503, message: 'database unavailable',
      });
    }
  });

  it('normalizes other SQLSTATE values as internal failures', () => {
    expect(normalizeDatabaseError(codedError('22001'))).toEqual({
      code: 'db_internal', status: 500, message: 'internal error',
    });
  });
});
