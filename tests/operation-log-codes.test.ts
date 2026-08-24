import { describe, expect, it } from 'vitest';
import { OPERATION_LOG_CODES } from '@/lib/operation-log-codes';

describe('operation log codes', () => {
  it('keeps every code unique and machine-readable', () => {
    const codes = Object.values(OPERATION_LOG_CODES);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^\[[A-Z][A-Z0-9_]+\]$/);
  });
});
