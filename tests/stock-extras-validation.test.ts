import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(__dirname, '..', path), 'utf8');
}

describe('stock extras validation boundary', () => {
  it('keeps every persisted eroge-price consumer on the canonical decoder', () => {
    for (const path of [
      'src/lib/db.ts',
      'src/lib/stock-prices.ts',
      'src/components/StockPanel.tsx',
      'src/components/ErogePricePanel.tsx',
      'src/app/vn/[id]/page.tsx',
    ]) {
      const body = source(path);
      expect(body, path).not.toMatch(/JSON\.parse\([^)]*extras_json/);
    }
  });

  it('validates provider writes before persisting the JSON envelope', () => {
    const body = source('src/lib/db.ts');
    expect(body).toContain("if (provider !== 'eroge_price') return false");
    expect(body).toContain('const normalized = decodeStoredExtras(payload)');
    expect(body).toContain('if (!normalized) return false');
    expect(body).not.toContain('export function getStockProviderExtras');
  });
});
