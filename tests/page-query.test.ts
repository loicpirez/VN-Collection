import { describe, expect, it } from 'vitest';
import { parseStockVnQuery } from '@/lib/page-query';

describe('stock page query', () => {
  it('normalizes a valid scalar VN id', () => {
    expect(parseStockVnQuery({ vn: 'V21905' })).toBe('v21905');
  });

  it('uses the first value of an array query', () => {
    expect(parseStockVnQuery({ vn: ['EGS_42', 'v1'] })).toBe('egs_42');
  });

  it('rejects absent, empty, and malformed values', () => {
    expect(parseStockVnQuery({})).toBeNull();
    expect(parseStockVnQuery({ vn: '' })).toBeNull();
    expect(parseStockVnQuery({ vn: 'not-a-vn' })).toBeNull();
  });
});
