import { describe, expect, it } from 'vitest';
import { parseErogePrice } from '@/lib/stock';

const VN_ID = 'v97000';
const URL = 'https://eroge-price.com/games/9999';
const NOW = 1_700_000_000_000;

describe('parseErogePrice — table rows', () => {
  it('captures seller, edition, price, and condition from a 5-cell row', () => {
    const html = `
      <h1>Sample Title</h1>
      <table><tbody>
        <tr>
          <td><a href="https://www.amazon.co.jp/dp/B000JF6UD2">Amazon</a></td>
          <td>通常版</td>
          <td>¥3,300</td>
          <td>新品</td>
          <td>1ポイント</td>
        </tr>
      </tbody></table>
    `;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers.length).toBeGreaterThan(0);
    const a = offers[0];
    expect(a.provider).toBe('eroge_price');
    expect(a.price).toBe(3300);
    expect(a.location_label).toBe('Amazon');
    expect(a.edition_label).toBe('通常版');
    expect(a.condition).toBe('新品');
    // The seller link in the seller cell becomes the offer URL.
    expect(a.url).toBe('https://www.amazon.co.jp/dp/B000JF6UD2');
  });

  it('falls back to the page URL when no outbound link is present', () => {
    const html = `
      <h1>Sample Title</h1>
      <table><tbody>
        <tr>
          <td>SomeShop</td>
          <td>通常版</td>
          <td>¥1,500</td>
          <td>中古</td>
          <td>0</td>
        </tr>
      </tbody></table>
    `;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0].url).toBe(URL);
    expect(offers[0].condition).toBe('中古');
  });

  it('treats "品切" in the row as out_of_stock', () => {
    const html = `
      <h1>Sample Title</h1>
      <table><tbody>
        <tr>
          <td><a href="https://www.amazon.co.jp/dp/B000JF6UD2">Amazon</a></td>
          <td>通常版</td>
          <td>¥3,300</td>
          <td>品切</td>
          <td>—</td>
        </tr>
      </tbody></table>
    `;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0].availability).toBe('out_of_stock');
  });

  it('treats "在庫あり" anywhere in the row as in_stock', () => {
    const html = `
      <h1>Sample Title</h1>
      <table><tbody>
        <tr>
          <td><a href="https://www.amazon.co.jp/dp/B000JF6UD2">Amazon</a></td>
          <td>通常版</td>
          <td>¥3,300</td>
          <td>新品</td>
          <td>在庫あり</td>
        </tr>
      </tbody></table>
    `;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0].availability).toBe('in_stock');
  });

  it('dedupes rows that produce the same key', () => {
    const html = `
      <h1>Sample</h1>
      <table>
        <tr>
          <td>Shop</td><td>通常版</td><td>¥1,500</td><td>新品</td><td>0</td>
        </tr>
        <tr>
          <td>Shop</td><td>通常版</td><td>¥1,500</td><td>新品</td><td>1</td>
        </tr>
      </table>
    `;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    // Same seller / edition / price / condition → dedup retains the first.
    expect(offers).toHaveLength(1);
  });

  it('uses an outbound link from a non-seller cell as the fallback URL', () => {
    const html = `
      <h1>Sample</h1>
      <table>
        <tr>
          <td>Shop</td>
          <td>限定版</td>
          <td>¥9,800</td>
          <td>新品</td>
          <td><a href="https://www.suruga-ya.jp/product/detail/123456">店舗ページ</a></td>
        </tr>
      </table>
    `;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0].url).toBe('https://www.suruga-ya.jp/product/detail/123456');
    expect(offers[0].edition_label).toBe('限定版');
  });

  it('ignores rows with empty seller or price', () => {
    const html = `
      <h1>Sample</h1>
      <table>
        <tr>
          <td></td><td>通常版</td><td>¥1,500</td><td>新品</td><td>0</td>
        </tr>
        <tr>
          <td>Shop</td><td>通常版</td><td></td><td>新品</td><td>0</td>
        </tr>
      </table>
    `;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers).toHaveLength(0);
  });

  it('JAN/EAN code in the page is plumbed to every offer', () => {
    const html = `
      <h1>Sample</h1>
      <p>JAN: 4988601012345</p>
      <table>
        <tr>
          <td>Shop</td><td>通常版</td><td>¥1,500</td><td>新品</td><td>0</td>
        </tr>
      </table>
    `;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0].jan).toBe('4988601012345');
  });
});

describe('parseErogePrice — JSON-LD Offer nodes', () => {
  it('captures price + seller + url from a JSON-LD Offer', () => {
    const html = `
      <h1>Sample</h1>
      <script type="application/ld+json">
        {
          "@type": "Product",
          "offers": [
            {
              "@type": "Offer",
              "price": 2980,
              "url": "https://www.amazon.co.jp/dp/B000JF6UD2",
              "availability": "https://schema.org/InStock",
              "seller": { "name": "Amazon JP" }
            }
          ]
        }
      </script>
    `;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      price: 2980,
      url: 'https://www.amazon.co.jp/dp/B000JF6UD2',
      availability: 'in_stock',
      location_label: 'Amazon JP',
    });
  });

  it('parses OutOfStock availability', () => {
    const html = `
      <h1>Sample</h1>
      <script type="application/ld+json">
        {
          "@type": "Product",
          "offers": [{
            "@type": "Offer",
            "price": 1000,
            "url": "https://example.com/x",
            "availability": "OutOfStock",
            "seller": { "name": "Shop" }
          }]
        }
      </script>
    `;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0].availability).toBe('out_of_stock');
  });
});
