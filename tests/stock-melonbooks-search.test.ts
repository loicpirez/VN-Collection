import { describe, expect, it } from 'vitest';
import { extractMelonbooksProductLinks, parseMelonbooksDetail } from '@/lib/stock';

const baseSearchUrl = 'https://www.melonbooks.co.jp/search/search.php?name=test';

describe('Melonbooks title search → detail flow', () => {
  it('extracts product detail URLs from a search listing', () => {
    const html = `
      <ul class="search-result">
        <li><a href="/detail/detail.php?product_id=111111">A</a></li>
        <li><a href="/detail/detail.php?product_id=222222&category=adult">B</a></li>
        <li><a href="https://www.melonbooks.co.jp/detail/detail.php?product_id=333333">C absolute</a></li>
      </ul>
    `;
    const links = extractMelonbooksProductLinks(html, baseSearchUrl);
    expect(links).toContain('https://www.melonbooks.co.jp/detail/detail.php?product_id=111111');
    expect(links).toContain('https://www.melonbooks.co.jp/detail/detail.php?product_id=222222&category=adult');
    expect(links).toContain('https://www.melonbooks.co.jp/detail/detail.php?product_id=333333');
    expect(links).toHaveLength(3);
  });

  it('skips non-detail facet/category links and dedupes by product_id', () => {
    const html = `
      <a href="/detail/detail.php?product_id=42&shop=akihabara">42-a</a>
      <a href="/detail/detail.php?product_id=42&shop=osaka">42-b</a>
      <a href="/category/list.php?genre=visual_novel">facet</a>
      <a href="/shop/detail.php?store_id=1">non-product</a>
    `;
    const links = extractMelonbooksProductLinks(html, baseSearchUrl);
    expect(links).toHaveLength(1);
    expect(links[0]).toContain('product_id=42');
  });

  it('skips cross-host product links', () => {
    const html = `
      <a href="https://shop.melonbooks.co.jp/detail/detail.php?product_id=999">offsite</a>
      <a href="/detail/detail.php?product_id=1">onsite</a>
    `;
    const links = extractMelonbooksProductLinks(html, baseSearchUrl);
    expect(links).toEqual(['https://www.melonbooks.co.jp/detail/detail.php?product_id=1']);
  });

  it('returns [] when search page has no product links', () => {
    const html = `<html><body><p>No results.</p></body></html>`;
    expect(extractMelonbooksProductLinks(html, baseSearchUrl)).toEqual([]);
  });

  it('chains into parseMelonbooksDetail for the standard product layout', () => {
    const detailHtml = `
      <h1 class="page-header">Game Title</h1>
      <p class="price"><span class="price--value">3,200</span>円</p>
      <span class="product-info__inventory-status__text">在庫あり</span>
    `;
    const detail = parseMelonbooksDetail(detailHtml, 'https://www.melonbooks.co.jp/detail/detail.php?product_id=1', {
      url: 'https://www.melonbooks.co.jp/detail/detail.php?product_id=1',
      releaseId: null,
      jan: null,
    });
    expect(detail).not.toBeNull();
    expect(detail).toMatchObject({
      title: 'Game Title',
      price: 3200,
      availability: 'in_stock',
      availability_label: '在庫あり',
    });
  });
});
