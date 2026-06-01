import { describe, expect, it } from 'vitest';
import { parseGenericProviderPage } from '@/lib/stock';

const TARGET = {
  url: 'https://shop.example/search?q=test',
  releaseId: null,
  jan: null,
  query: 'test',
};

describe('parseGenericProviderPage — Animate', () => {
  it('extracts list cards from animate-onlineshop HTML', () => {
    const html = `
      <ul>
        <li>
          <div class="item_list_class">
            <h3>
              <a href="/products/detail.php?product_id=1" title="test 通常版">test 通常版</a>
            </h3>
            <p class="price">¥7,260</p>
            <p class="stock">在庫あり</p>
          </div>
        </li>
      </ul>
    `;
    const offers = parseGenericProviderPage('animate', html, 'https://www.animate-onlineshop.jp/list', TARGET);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      title: 'test 通常版',
      price: 7260,
      availability: 'in_stock',
      location_label: 'Animate',
    });
  });

  it('skips items whose title does not include the query', () => {
    const html = `
      <li>
        <div class="item_list_class">
          <h3>
            <a href="/products/detail.php?product_id=1" title="unrelated product">unrelated product</a>
          </h3>
          <p class="price">¥1,000</p>
          <p class="stock">在庫あり</p>
        </div>
      </li>
    `;
    const offers = parseGenericProviderPage('animate', html, 'https://www.animate-onlineshop.jp/list', TARGET);
    expect(offers).toHaveLength(0);
  });
});

describe('parseGenericProviderPage — Getchu', () => {
  it('extracts list blocks', () => {
    const html = `
      <ul>
        <li>
          <div class="content_block">
            <A HREF="//www.getchu.com/soft.phtml?id=1" class="blueb">test サンプル</A>
            <SPAN class="redb">3,300円</SPAN>
            <!--予約-->
          </div>
        </li>
      </ul>
    `;
    const offers = parseGenericProviderPage('getchu', html, 'https://www.getchu.com/search', TARGET);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      title: 'test サンプル',
      price: 3300,
      location_label: 'Getchu',
    });
  });
});

describe('parseGenericProviderPage — GEO', () => {
  it('extracts list cards with condition', () => {
    const html = `
      <ul>
        <li>
          <a class="sendDatalayer" href="/shop/goods/goods.aspx?goods=1">
            <h3 class="itemName">test 通常版</h3>
          </a>
          <div class="sellPtnLeftPrice">2,980円</div>
          <span class="labelNow">在庫あり</span>
          <span class="labelSituation">中古</span>
        </li>
      </ul>
    `;
    const offers = parseGenericProviderPage('geo', html, 'https://ec.geo-online.co.jp/shop/goods', TARGET);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      title: 'test 通常版',
      price: 2980,
      condition: '中古',
      location_label: 'GEO',
    });
  });

  it('accepts list-item classes, extra card classes, and href before class', () => {
    const html = `
      <ul>
        <li class="goodsListItem">
          <a href="/shop/g/g515861501/" data-code="fixture" class="card sendDatalayer tracked">
            <span class="labelNow reserve">予約受付中</span>
            <span class="badge labelSituation new">新品</span>
            <h3 class="line-clamp itemName compact">test 初回版</h3>
            <div class="price sellPtnLeftPrice active"><b>7,450</b><span>円</span></div>
          </a>
        </li>
      </ul>
    `;
    const offers = parseGenericProviderPage('geo', html, 'https://ec.geo-online.co.jp/shop/goods', TARGET);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      title: 'test 初回版',
      url: 'https://ec.geo-online.co.jp/shop/g/g515861501/',
      price: 7450,
      availability: 'in_stock',
      condition: '新品',
      location_label: 'GEO',
    });
  });
});

describe('parseGenericProviderPage — Yodobashi', () => {
  it('extracts product cards', () => {
    const html = `<div class="productListTile"><a href="https://www.yodobashi.com/product/100000001234/"><div class="pName">test サンプル ソフト</div></a><span class="productPrice">¥4,950</span><span class="green">在庫あり</span><!-- /pListBlock -->`;
    const offers = parseGenericProviderPage('yodobashi', html, 'https://www.yodobashi.com/?word=test', TARGET);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]).toMatchObject({
      title: 'test サンプル ソフト',
      price: 4950,
      location_label: 'Yodobashi',
    });
  });

  it('skips entries without a /product/ href', () => {
    const html = `<div class="productListTile"><a href="https://www.yodobashi.com/category/test"><div class="pName">test</div></a><span class="productPrice">¥1,000</span><!-- /pListBlock -->`;
    const offers = parseGenericProviderPage('yodobashi', html, 'https://www.yodobashi.com/?word=test', TARGET);
    expect(offers).toHaveLength(0);
  });
});

describe('parseGenericProviderPage — Amazon DP (direct)', () => {
  it('parses an Amazon DP detail page using ASIN from the URL', () => {
    const html = `
      <html>
        <head><title>サンプル test ゲーム : Amazon.co.jp</title></head>
        <body>
          <span id="productTitle">サンプル test ゲーム</span>
          <span class="a-offscreen">¥3,980</span>
          <div id="availability">在庫あり</div>
        </body>
      </html>
    `;
    const offers = parseGenericProviderPage(
      'amazon_jp',
      html,
      'https://www.amazon.co.jp/dp/B000JF6UD2',
      { ...TARGET, url: 'https://www.amazon.co.jp/dp/B000JF6UD2', productId: 'B000JF6UD2' },
    );
    expect(offers.length).toBe(1);
    expect(offers[0]).toMatchObject({
      provider_offer_id: 'B000JF6UD2',
      product_id: 'B000JF6UD2',
      url: 'https://www.amazon.co.jp/dp/B000JF6UD2',
      title: 'サンプル test ゲーム',
      page_kind: 'detail',
      price: 3980,
    });
  });

  it('returns nothing for an Amazon URL without ASIN (search page)', () => {
    const html = `<html><body>...</body></html>`;
    const offers = parseGenericProviderPage(
      'amazon_jp',
      html,
      'https://www.amazon.co.jp/s?k=nothing',
      { ...TARGET, url: 'https://www.amazon.co.jp/s?k=nothing' },
    );
    // Falls through to search list parser → no role=listitem → 0 results.
    expect(offers).toHaveLength(0);
  });
});

describe('parseGenericProviderPage — fallback safety', () => {
  it('returns empty array for an unknown provider page structure', () => {
    const offers = parseGenericProviderPage('animate', '<html></html>', 'https://www.animate-onlineshop.jp/', TARGET);
    expect(offers).toEqual([]);
  });

  it('skips items whose title is a pseudo search-page title', () => {
    const html = `
      <li>
        <div class="item_list_class">
          <h3>
            <a href="/x" title="testの検索結果">testの検索結果</a>
          </h3>
          <p class="price">¥1,000</p>
          <p class="stock">在庫あり</p>
        </div>
      </li>
    `;
    const offers = parseGenericProviderPage('animate', html, 'https://www.animate-onlineshop.jp/list', TARGET);
    expect(offers).toHaveLength(0);
  });
});
