import { describe, expect, it } from 'vitest';
import { parseErogePrice } from '@/lib/stock';

const VN_ID = 'v97001';
const URL = 'https://eroge-price.com/games/9001';
const NOW = 1_700_000_000_000;

/**
 * Targets the parseErogePrice branches the existing stock-eroge-price suite
 * does not reach: the version-heading edition inheritance, the 取扱なし
 * out-of-stock row, sale-price selection over regular price, list-price
 * extraction, an img-alt-only seller label, and the vnTitle override.
 */

describe('parseErogePrice — version heading + sale + list price', () => {
  it('inherits the edition label from the preceding version heading', () => {
    const html = `
      <h1>サンプルタイトル</h1>
      <h2>ダウンロード版</h2>
      <table><tbody>
        <tr><td><a href="https://www.dlsite.com/x">DLsite</a></td><td>-</td><td>¥2,200</td><td>セール中</td><td>-</td></tr>
      </tbody></table>`;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0].edition_label).toBe('ダウンロード版');
  });

  it('selects the sale price over the regular price and records list price', () => {
    const html = `
      <h1>サンプルタイトル</h1>
      <table><tbody>
        <tr>
          <td><a href="https://www.amazon.co.jp/dp/B000JF6UD2">Amazon</a></td>
          <td>¥3,000</td>
          <td>¥2,400</td>
          <td>-20% OFF</td>
          <td>新品</td>
          <td>¥3,300*</td>
        </tr>
      </tbody></table>`;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0].price).toBe(2400);
    expect(offers[0].list_price).toBe(3300);
  });

  it('marks a 取扱なし row as out_of_stock with a null price', () => {
    const html = `
      <h1>サンプルタイトル</h1>
      <table><tbody>
        <tr><td><a href="https://www.getchu.com/x">Getchu</a></td><td>取扱なし</td></tr>
      </tbody></table>`;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers).toHaveLength(1);
    expect(offers[0].availability).toBe('out_of_stock');
    expect(offers[0].price).toBeNull();
  });

  it('falls back to the shop hostname when the seller cell has only a link', () => {
    const html = `
      <h1>サンプルタイトル</h1>
      <table><tbody>
        <tr><td><a href="https://www.suruga-ya.jp/product/detail/1"><img src="logo.png"></a></td><td>¥1,200</td></tr>
      </tbody></table>`;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0].location_label).toBe('suruga-ya.jp');
  });

  it('reads the seller name from an <img alt> when the cell is logo-only', () => {
    const html = `
      <h1>サンプルタイトル</h1>
      <table><tbody>
        <tr><td><a href="https://www.dlsite.com/x"><img alt="DLsite Store" src="logo.png"></a></td><td>¥1,500</td></tr>
      </tbody></table>`;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0].location_label).toBe('DLsite Store');
  });

  it('prefers the explicit VN title over the page heading', () => {
    const html = `<h1>Eroge Price Page Heading</h1><table><tbody>
      <tr><td><a href="https://www.dlsite.com/x">DLsite</a></td><td>¥1,500</td></tr>
    </tbody></table>`;
    const offers = parseErogePrice(html, URL, VN_ID, NOW, 'My Real VN Title');
    expect(offers[0].title).toBe('My Real VN Title');
  });

  it('uses a default page title when neither h1 nor title exists', () => {
    const html = `<table><tbody>
      <tr><td><a href="https://www.dlsite.com/x">DLsite</a></td><td>¥1,500</td></tr>
    </tbody></table>`;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0].title).toBe('Eroge Price');
  });

  it('captures the JAN from the page and a download-version heading together', () => {
    const html = `
      <h1>サンプルタイトル</h1>
      <p>JAN: 4988601098765</p>
      <h3>パッケージ版</h3>
      <table><tbody>
        <tr><td><a href="https://www.amazon.co.jp/dp/B000JF6UD2">Amazon</a></td><td>¥4,800</td><td>-</td><td>-</td><td>新品</td></tr>
      </tbody></table>`;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0].jan).toBe('4988601098765');
    expect(offers[0].edition_label).toBe('パッケージ版');
  });
});

describe('parseErogePrice — JSON-LD edge cases', () => {
  it('reads a numeric-string price and LimitedAvailability schema', () => {
    const html = `
      <h1>サンプル</h1>
      <script type="application/ld+json">
        { "@type": "Offer", "price": "1980", "url": "https://example.com/x",
          "availability": "https://schema.org/LimitedAvailability", "seller": { "name": "Shop Z" } }
      </script>`;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0]).toMatchObject({ price: 1980, availability: 'limited', location_label: 'Shop Z' });
  });

  it('ignores malformed JSON-LD blocks without throwing', () => {
    const html = `
      <h1>サンプル</h1>
      <script type="application/ld+json">{ not valid json }</script>
      <table><tbody><tr><td><a href="https://www.dlsite.com/x">DLsite</a></td><td>¥1,200</td></tr></tbody></table>`;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers).toHaveLength(1);
    expect(offers[0].location_label).toBe('DLsite');
  });

  it('falls back to the page URL when a JSON-LD Offer carries no url', () => {
    const html = `
      <h1>サンプル</h1>
      <script type="application/ld+json">{ "@type": "Offer", "price": 1000, "seller": { "name": "NoUrl Shop" } }</script>`;
    const offers = parseErogePrice(html, URL, VN_ID, NOW);
    expect(offers[0].url).toBe(URL);
  });
});
