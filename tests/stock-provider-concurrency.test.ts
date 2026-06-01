import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/lib/stock.ts'), 'utf8');

describe('per-VN stock provider concurrency', () => {
  it('uses a bounded provider wave size and a provider-level deadline', () => {
    expect(source).toContain('const STOCK_PROVIDER_TIMEOUT_MS = 45_000');
    expect(source).toContain('const STOCK_PROVIDER_CONCURRENCY = 4');
    expect(source).toContain('setTimeout(() => providerCtrl.abort(), STOCK_PROVIDER_TIMEOUT_MS)');
    expect(source).toContain('`provider timeout after ${STOCK_PROVIDER_TIMEOUT_MS}ms`');
  });

  it('runs each bounded wave concurrently while reporting progress in input order', () => {
    expect(source).toContain('const chunk = activeProviders.slice(start, start + STOCK_PROVIDER_CONCURRENCY)');
    expect(source).toContain('await Promise.all(chunk.map(refreshOneProvider))');
    expect(source).toContain('for (const provider of chunk)');
    expect(source).toContain('onProviderProgress?.(provider, completedProviders, activeProviders.length)');
  });

  it('propagates the outer cancellation signal and removes the listener afterward', () => {
    expect(source).toContain("signal?.addEventListener('abort', onOuterAbort, { once: true })");
    expect(source).toContain("signal?.removeEventListener('abort', onOuterAbort)");
  });
});
