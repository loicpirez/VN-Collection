import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stockSource = readFileSync(new URL('../src/lib/stock.ts', import.meta.url), 'utf8');

describe('stock persisted presentation values', () => {
  it('stores app-authored condition and edition labels as stable slugs', () => {
    expect(stockSource).not.toMatch(/condition:\s*'Used'/);
    expect(stockSource).not.toMatch(/condition:\s*'New'/);
    expect(stockSource).not.toMatch(/edition_label:\s*'Store bonus'/);
    expect(stockSource).not.toMatch(/edition_label:\s*'Edition \/ bonus'/);
    expect(stockSource).toContain("condition: 'used'");
    expect(stockSource).toContain("edition_label: /特典|限定|limited|set|box/i.test(title + html.slice(0, 2000)) ? 'store_bonus' : null");
  });

  it('stores generated marketplace and AliceNet availability as stable values', () => {
    expect(stockSource).not.toContain('Marketplace: ¥');
    expect(stockSource).not.toContain("availability_label: 'AliceNet stock'");
    expect(stockSource).toContain('availLabel = `marketplace:${card.marketplacePrice}`');
    expect(stockSource).toContain("availability_label: 'alicenet_stock'");
  });
});
