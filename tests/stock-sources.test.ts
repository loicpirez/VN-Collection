import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteStockSource, listStockSources, upsertStockSource } from '@/lib/db';
import { detectStockProviderFromUrl, extractAmazonAsin } from '@/lib/stock';

const VN_ID = 'v99996';

function clearSources() {
  for (const source of listStockSources(VN_ID)) {
    deleteStockSource(VN_ID, source.id);
  }
}

beforeEach(clearSources);
afterEach(clearSources);

describe('manual stock sources', () => {
  it('stores a direct Amazon DP source with provider and product id', () => {
    const url = 'https://www.amazon.co.jp/dp/B000JF6UD2';
    const row = upsertStockSource({
      vn_id: VN_ID,
      provider: detectStockProviderFromUrl(url) ?? 'amazon_jp',
      url,
      product_id: extractAmazonAsin(url),
    });

    expect(row.provider).toBe('amazon_jp');
    expect(row.product_id).toBe('B000JF6UD2');
    expect(listStockSources(VN_ID)).toHaveLength(1);
  });

  it('updates an existing direct source instead of duplicating it', () => {
    const url = 'https://www.amazon.co.jp/dp/B000JF6UD2';
    upsertStockSource({ vn_id: VN_ID, provider: 'amazon_jp', url, product_id: 'B000JF6UD2' });
    upsertStockSource({ vn_id: VN_ID, provider: 'amazon_jp', url, release_id: 'r123', product_id: 'B000JF6UD2' });

    const sources = listStockSources(VN_ID);
    expect(sources).toHaveLength(1);
    expect(sources[0].release_id).toBe('r123');
  });

  it('deletes a source by VN and source id only', () => {
    const row = upsertStockSource({
      vn_id: VN_ID,
      provider: 'amazon_jp',
      url: 'https://www.amazon.co.jp/dp/B000JF6UD2',
      product_id: 'B000JF6UD2',
    });

    expect(deleteStockSource('v00001', row.id)).toBe(false);
    expect(listStockSources(VN_ID)).toHaveLength(1);
    expect(deleteStockSource(VN_ID, row.id)).toBe(true);
    expect(listStockSources(VN_ID)).toEqual([]);
  });
});
