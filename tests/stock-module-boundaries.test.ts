import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const STOCK = readFileSync('src/lib/stock.ts', 'utf8');
const PANEL = readFileSync('src/components/StockPanel.tsx', 'utf8');

describe('stock module boundaries', () => {
  it('extracts provider capabilities from the fetch-and-parse module', () => {
    expect(STOCK).toContain("from './stock-provider-capabilities'");
    expect(STOCK).not.toContain('const PROVIDERS: StockProviderMeta[]');
  });

  it('extracts title query generation from the fetch-and-parse module', () => {
    expect(STOCK).toContain("from './stock-query'");
    expect(STOCK).not.toContain('function titleQueries(');
  });

  it('uses a shared client API DTO instead of panel-local response interfaces', () => {
    expect(PANEL).toContain("from '@/lib/stock-api-types'");
    expect(PANEL).not.toContain('interface StockSnapshot {');
    expect(PANEL).not.toContain('interface StockOffer {');
  });
});
