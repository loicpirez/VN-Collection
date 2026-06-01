import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STOCK_PROVIDER_IDS, getProviderMeta } from '@/lib/stock';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('stock provider capability contract', () => {
  it('describes every live provider and the cached inventory provider', () => {
    for (const id of [...STOCK_PROVIDER_IDS, 'alicenet'] as const) {
      const meta = getProviderMeta(id);
      expect(meta?.lookupCapabilities.length, id).toBeGreaterThan(0);
      expect(meta?.resultCapability, id).toBeTruthy();
      expect(meta?.supportLevel, id).toBeTruthy();
    }
  });

  it('distinguishes aggregate prices, JAN lookup, cached inventory, and search leads', () => {
    expect(getProviderMeta('eroge_price')).toMatchObject({
      lookupCapabilities: ['aggregate_price', 'title_search'],
      resultCapability: 'structured_prices',
      supportLevel: 'supported',
    });
    expect(getProviderMeta('sofmap')?.lookupCapabilities).toContain('jan_lookup');
    expect(getProviderMeta('hgame1')?.lookupCapabilities).toContain('jan_lookup');
    expect(getProviderMeta('alicenet')).toMatchObject({
      lookupCapabilities: ['cached_inventory'],
      resultCapability: 'cached_offers',
      supportLevel: 'supported',
    });
    for (const id of ['gamecity', 'amiami', 'neowing'] as const) {
      expect(getProviderMeta(id)).toMatchObject({
        resultCapability: 'search_leads',
        supportLevel: 'manual_only',
      });
    }
  });

  it('renders capability metadata in provider tiles', () => {
    const panel = source('src/components/StockPanel.tsx');
    expect(panel).toContain('function providerCapabilityText');
    expect(panel).toContain('provider.resultCapability');
    expect(panel).toContain("provider.lookupCapabilities?.includes('jan_lookup')");
    expect(panel).toContain("provider.supportLevel === 'manual_only'");
    expect(panel).toContain('?? fallback');
    expect(panel).toContain('{capabilityLabel}');
  });

  it('documents the capability matrix on canonical documentation surfaces', () => {
    const readme = source('README.md');
    const features = source('FEATURES.md');
    const claude = source('CLAUDE.md');
    expect(readme).toContain('Provider tiles distinguish structured prices, structured offers, cached inventory, and search-link-only integrations.');
    expect(features).toContain('| `search_leads` | GAMECITY, AmiAmi, Neowing |');
    expect(claude).toContain('## Generic stock provider capability contract');
    expect(features).toContain('src/lib/stock-provider-capabilities.ts');
    expect(claude).toContain('src/lib/stock-provider-capabilities.ts');
    expect(features).not.toContain('`StockProviderMeta` in `src/lib/stock.ts`');
    expect(claude).not.toContain('`StockProviderMeta` in `src/lib/stock.ts`');
    expect(claude).toContain('GAMECITY, AmiAmi, and Neowing intentionally remain `search_leads`');
  });
});
