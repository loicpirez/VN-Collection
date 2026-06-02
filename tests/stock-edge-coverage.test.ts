import { describe, expect, it } from 'vitest';
import {
  detectStockProviderFromUrl,
  extractAmazonAsin,
  extractHgame1SearchLinks,
  extractMelonbooksProductLinks,
  parseAmazonDetail,
  parseErogePrice,
  parseGenericProviderPage,
  parseHgame1Detail,
  parseMandarakeDetail,
  parseMelonbooksDetail,
  parseSofmapDetail,
  parseSofmapList,
  parseSurugayaSearch,
  parseTraderChukoDetail,
  parseTraderChukoSmartphoneList,
  parseWondergooDetail,
} from '@/lib/stock';

const TARGET = {
  url: 'https://shop.example/search?q=sample',
  releaseId: 'r90001',
  jan: '4900000000000',
  query: 'sample',
};

describe('stock parser URL and identity edges', () => {
  it('returns null for malformed or unsupported provider URLs', () => {
    expect(detectStockProviderFromUrl('not a url')).toBeNull();
    expect(detectStockProviderFromUrl('https://example.test/item')).toBeNull();
    expect(extractAmazonAsin('not a url')).toBeNull();
    expect(extractAmazonAsin('https://example.test/dp/B000JF6UD2')).toBeNull();
    expect(extractAmazonAsin('https://www.amazon.co.jp/search?q=B000JF6UD2')).toBeNull();
    expect(extractAmazonAsin('https://www.amazon.co.jp/gp/product/B000JF6UD2')).toBe('B000JF6UD2');
  });
});

describe('Sofmap parser edges', () => {
  it('skips malformed and unrelated list rows while preserving unknown stock and alternate JAN extraction', () => {
    const html = `<ul id="change_style_list">
      <li><span>not a product</span></li>
      <li><a href="/product_detail.aspx?sku=1" class="itemimg">relative detail is ignored</a></li>
      <li>
        <a href="https://a.sofmap.com/product_detail.aspx?sku=2" class="itemimg">x</a>
        <a href="https://a.sofmap.com/product_detail.aspx?sku=2" class="product_name">unrelated</a>
      </li>
      <li>
        <a href="https://a.sofmap.com/product_detail.aspx?sku=3" class="itemimg">x</a>
        <a href="https://a.sofmap.com/product_detail.aspx?sku=3" class="product_name">sample title</a>
        <span class="stock">確認中</span><a href="?new_jan=4912345678901">used</a>
      </li>
      <li>
        <a href="https://a.sofmap.com/product_detail.aspx?sku=4" class="itemimg">x</a>
        <a href="https://a.sofmap.com/product_detail.aspx?sku=4" class="product_name">sample second</a>
        <img src="/images/newitem4912345678902.jpg"><span class="stock">通常</span>
      </li>
    </ul>`;
    const offers = parseSofmapList(html, { ...TARGET, jan: null });
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ provider_offer_id: '3', availability: 'unknown', jan: '4912345678901' });
    expect(offers[1]).toMatchObject({ provider_offer_id: '4', availability: 'in_stock', jan: '4912345678902' });
  });

  it('uses the title fallback and URL identity fallback on detail pages', () => {
    expect(parseSofmapDetail('<title>18歳以上ですか</title>', 'https://a.sofmap.com/item', TARGET)).toBeNull();
    expect(parseSofmapDetail('<p>no title</p>', 'https://a.sofmap.com/item', TARGET)).toBeNull();
    expect(parseSofmapDetail('<title>sample title</title><p>在庫なし</p>', 'https://a.sofmap.com/item', { ...TARGET, jan: null }))
      .toMatchObject({ provider_offer_id: 'https://a.sofmap.com/item', availability: 'unknown' });
  });
});

describe('Unoya and Melonbooks parser edges', () => {
  it('handles Unoya age checks, fallback price parsing, unknown stock, deduped search links, and wrong hosts', () => {
    expect(parseHgame1Detail('<title>年齢確認</title>', 'https://www.hgame1.com/item/x.html', TARGET)).toBeNull();
    expect(parseHgame1Detail('<p>nothing</p>', 'https://www.hgame1.com/item/x.html', TARGET)).toBeNull();
    expect(parseHgame1Detail('<title>sample</title><p>販売価格 1,280円</p>', 'https://www.hgame1.com/item/x.html', { ...TARGET, jan: null }))
      .toMatchObject({ provider_offer_id: '/item/x.html', price: 1280, availability: 'unknown', availability_label: null });
    const links = extractHgame1SearchLinks(
      `<a href="/item/abc.html">a</a><a href="/item/abc.html">dup</a><a href="https://example.test/item/no.html">bad</a>`,
      'https://www.hgame1.com/msearch/msearch.cgi',
    );
    expect(links).toEqual(['https://www.hgame1.com/item/abc.html']);
  });

  it('maps Unoya fallback sold-out text without a stock code', () => {
    expect(parseHgame1Detail('<title>sample</title><p>out of stock</p>', 'https://www.hgame1.com/item/x.html', { ...TARGET, jan: null }))
      .toMatchObject({ availability: 'out_of_stock' });
  });

  it('handles Melonbooks missing titles, fallback status text, and fallback identities', () => {
    expect(parseMelonbooksDetail('<p>nothing</p>', 'https://www.melonbooks.co.jp/detail/detail.php', TARGET)).toBeNull();
    expect(parseMelonbooksDetail('<title>sample</title><p>在庫あり 2,200円</p>', 'https://www.melonbooks.co.jp/detail/detail.php', { ...TARGET, jan: null }))
      .toMatchObject({ provider_offer_id: 'https://www.melonbooks.co.jp/detail/detail.php', availability: 'in_stock', price: 2200 });
    expect(extractMelonbooksProductLinks('<a href="/detail/detail.php?product_id=1">x</a>', 'not a url')).toEqual([]);
  });
});

describe('Mandarake and WonderGOO parser edges', () => {
  it('covers Mandarake fallback title and identity branches', () => {
    expect(parseMandarakeDetail('<title>MANDARAKE</title><p>価格 1,000円</p>', 'https://order.mandarake.co.jp/order/list', { ...TARGET, jan: null }))
      .toBeNull();
    expect(parseMandarakeDetail('<meta itemprop="name" content="sample item"><p>1,000円</p>', 'https://order.mandarake.co.jp/order/list', { ...TARGET, jan: null }))
      .toMatchObject({ provider_offer_id: 'https://order.mandarake.co.jp/order/list', title: 'sample item' });
    expect(parseMandarakeDetail('<h1>sample item</h1>', 'https://order.mandarake.co.jp/order/detailPage/item?itemcode=lower', TARGET))
      .toMatchObject({ provider_offer_id: 'lower' });
  });

  it('parses a plain yen suffix on WonderGOO pages', () => {
    expect(parseWondergooDetail('<h1>sample plain</h1><p>1200円</p>', 'https://www.wonder.co.jp/item', TARGET))
      .toMatchObject({ price: 1200 });
  });

  it('covers WonderGOO missing title, meta title, URL identity, and plain edition branches', () => {
    expect(parseWondergooDetail('<p>nothing</p>', 'https://www.wonder.co.jp/item', TARGET)).toBeNull();
    expect(parseWondergooDetail('<meta property="og:title" content="sample plain">', 'https://www.wonder.co.jp/item', { ...TARGET, jan: null }))
      .toMatchObject({ provider_offer_id: 'https://www.wonder.co.jp/item', edition_label: null });
  });
});

describe('Trader parser edges', () => {
  it('skips malformed list rows and classifies unknown-price, complete, deluxe, and bundle editions', () => {
    const html = `<li>missing detail</li>
      <li><a href="detail.html"><p>sample missing id</p></a></li>
      <li><a href="detail.html?id=1"><p>sample plain</p></a></li>
      <li><a href="detail.html?id=2"><img alt="sample 完全生産限定版"><p class="price"><em>2,000</em></p></a></li>
      <li><a href="detail.html?id=3"><img alt="sample デラックス"><p class="price"><em>3,000</em></p></a></li>
      <li><a href="detail.html?id=4"><img alt="sample セット"><p class="price"><em>4,000</em></p></a></li>`;
    const offers = parseTraderChukoSmartphoneList(html, 'https://www.chuko-tsuhan.com/smartphone/list.html', { ...TARGET, jan: null });
    expect(offers.map((offer) => offer.availability)).toEqual(['unknown', 'in_stock', 'in_stock', 'in_stock']);
    expect(offers.map((offer) => offer.edition_label)).toEqual([null, 'complete_limited', 'deluxe_edition', 'bundle']);
  });

  it('uses paragraph titles and marks list-card sold-out state', () => {
    const offers = parseTraderChukoSmartphoneList(
      `<li><a href="detail.html?id=5"><p>sample paragraph</p><p class="soldout">売り切れ</p></a></li>`,
      'https://www.chuko-tsuhan.com/smartphone/list.html',
      { ...TARGET, jan: null },
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ title: 'sample paragraph', price: null, availability: 'out_of_stock' });
  });

  it('covers detail null-title, reverse meta attributes, reverse hidden price input, fallback availability, and malformed URL', () => {
    expect(parseTraderChukoDetail('<p>nothing</p>', 'not a url')).toBeNull();
    const fallback = {
      provider_offer_id: 'fallback',
      title: 'sample fallback',
      url: 'https://www.chuko-tsuhan.com/smartphone/detail.html',
      price: null,
      availability: 'limited' as const,
      availability_label: null,
      condition: null,
      edition_label: null,
      location_label: 'Trader',
      source_release_id: null,
      jan: null,
    };
    expect(parseTraderChukoDetail(
      `<meta content="sample reversed" property="og:title"><input value="1200" name="price2">`,
      'not a url',
      fallback,
    )).toMatchObject({ provider_offer_id: 'fallback', title: 'sample reversed', price: 1200, availability: 'in_stock' });
    expect(parseTraderChukoDetail('<title>sample unknown</title>', 'not a url', fallback))
      .toMatchObject({ availability: 'limited', price: null });
  });
});

describe('generic provider parser edges', () => {
  it('uses fallback list patterns for Animate and Gamers', () => {
    const animate = parseGenericProviderPage(
      'animate',
      `<li class="item"><a href="/p/1"><img alt="sample animate"></a><span class="price">1,000円</span></li>`,
      'https://www.animate-onlineshop.jp/list',
      TARGET,
    );
    expect(animate).toHaveLength(1);
    const gamers = parseGenericProviderPage(
      'gamers',
      `<li class="item"><a href="/p/2"><span class="name">sample gamers</span></a><span>2,000円</span></li>`,
      'https://www.gamers.co.jp/list',
      TARGET,
    );
    expect(gamers).toHaveLength(1);
  });

  it('skips structurally incomplete provider cards', () => {
    expect(parseGenericProviderPage('animate', '<li><div class="item_list_class"></div></li>', 'https://www.animate-onlineshop.jp/list', TARGET)).toEqual([]);
    expect(parseGenericProviderPage('ebten', '<dl class="block-thumbnail-t--goods"></dl>', 'https://store.kadokawa.co.jp/list', TARGET)).toEqual([]);
    expect(parseGenericProviderPage('getchu', '<li><div class="content_block"></div></li>', 'https://www.getchu.com/list', TARGET)).toEqual([]);
    expect(parseGenericProviderPage('gamers', '<li class="list_product"></li>', 'https://www.gamers.co.jp/list', TARGET)).toEqual([]);
    expect(parseGenericProviderPage('geo', '<li></li>', 'https://ec.geo-online.co.jp/list', TARGET)).toEqual([]);
    expect(parseGenericProviderPage('yodobashi', '<div class="productListTile"><!-- /pListBlock -->', 'https://www.yodobashi.com/list', TARGET)).toEqual([]);
    expect(parseGenericProviderPage('joshin', '<div class="search_container_name"></div>', 'https://joshinweb.jp/list', TARGET)).toEqual([]);
  });

  it('maps fallback pattern availability and full-width titles', () => {
    const out = parseGenericProviderPage(
      'animate',
      `<li class="item"><a href="/p/1"><img alt="ｓａｍｐｌｅ sold"></a><span>out of stock</span><span class="price">1,000円</span></li>`,
      'https://www.animate-onlineshop.jp/list',
      TARGET,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ availability: 'out_of_stock', edition_label: null });
    const unknown = parseGenericProviderPage(
      'gamers',
      `<li class="item"><a href="/p/2"><span class="name">sample pending</span></a><span>2,000円</span></li>`,
      'https://www.gamers.co.jp/list',
      TARGET,
    );
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({ availability: 'unknown' });
  });

  it('parses Yahoo Shopping beacon prices and reservation fallback', () => {
    const offers = parseGenericProviderPage(
      'asakusa_mach',
      `<a href="/item/1" data-beacon="tname:sample yahoo;prc:2500"><span class="ItemTitle">sample yahoo</span><span class="ItemPrice_ItemPrice">3,000円</span>予約</a>
       <a href="/item/2" data-beacon="tname:sample second;text:販売中"><span class="ItemTitle">sample second</span><span class="ItemPrice_ItemPrice">4,000円</span></a>`,
      'https://shopping.yahoo.co.jp/search/sample',
      TARGET,
    );
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ price: 2500, availability: 'in_stock' });
    expect(offers[1]).toMatchObject({ price: 4000, availability: 'in_stock' });
  });

  it('parses Amazon search result cards and skips pseudo titles', () => {
    const offers = parseGenericProviderPage(
      'amazon_jp',
      `<div role="listitem" data-asin="B000JF6UD2" data-component-type="s-search-result">
         <h2 aria-label="sample amazon"></h2><a href="/dp/B000JF6UD2">x</a><span class="a-offscreen">1,000円</span>予約
       </div>
       <div role="listitem" data-asin="B000JF6UD3" data-component-type="s-search-result">
         <h2 aria-label="1件の結果"></h2><a href="/dp/B000JF6UD3">x</a><span class="a-offscreen">2,000円</span>
       </div>`,
      'https://www.amazon.co.jp/s?k=sample',
      TARGET,
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ provider_offer_id: 'B000JF6UD2', price: 1000, availability: 'in_stock' });
  });

  it('parses MakeShop tiles and skips unrelated matches', () => {
    const html = `<li><div class="innerBox"><p class="name"><a href=/shop/item1>sample box</a></p><p class="price">3,000円</p></div></li>
      <li><div class="innerBox"><p class="name"><a href=/shop/item2>unrelated</a></p><p class="price">4,000円</p></div></li>`;
    expect(parseGenericProviderPage('otakarasouko', html, 'https://www.ec.otakarasouko.com/list', TARGET)).toHaveLength(1);
  });

  it('covers Amazon detail rejection and fallback extraction paths', () => {
    expect(parseAmazonDetail('<title>sample</title>', 'https://www.amazon.co.jp/search?q=x', { ...TARGET, productId: null })).toBeNull();
    expect(parseAmazonDetail('<title>1件の結果</title>', 'https://www.amazon.co.jp/dp/B000JF6UD2', TARGET)).toBeNull();
    expect(parseAmazonDetail(
      '<meta property="og:title" content="sample used"><span class="availability">残りわずか</span><span class="a-offscreen">¥900</span>',
      'https://www.amazon.co.jp/dp/B000JF6UD2',
      TARGET,
    )).toMatchObject({ price: 900, availability: 'limited', condition: 'used' });
  });
});

describe('Eroge Price and Suruga-ya parser edges', () => {
  it('deduplicates JSON-LD offers and covers arrays, unknown schema values, and primitive nodes', () => {
    const html = `<script type="application/ld+json">
      [{"@type":["Offer"],"price":"bad","url":"https://example.test/a","availability":5,"seller":{"name":5}},
       {"@type":"Offer","price":1000,"url":"https://example.test/a","availability":"InStock","seller":{"name":"Shop"}},
       {"@type":"Offer","price":2000,"url":"https://example.test/a","availability":"InStock","seller":{"name":"Shop"}}]
    </script>`;
    const offers = parseErogePrice(html, 'https://eroge-price.com/games/90001', 'v90001', 1);
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ price: null, availability: 'unknown', location_label: null });
  });

  it('covers Suruga title fallback, category fallback, new stock, badges, zero prices, and duplicate IDs', () => {
    const html = `<a href="/product/detail/1"></a><a href="/product/detail/1"></a>
      <a>sample fallback title</a><span class="category">PC</span><p>新品：￥2,000</p><p>定価：￥0</p><p>新入荷 値下げ 予約</p>
      <a href="/product/other/2">sample zero</a><span>中古：￥0</span><span>在庫あり</span>`;
    const result = parseSurugayaSearch(html);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]).toMatchObject({ title: 'sample fallback title', condition: 'new', officialAvailability: 'in_stock', listPrice: null });
    expect(result.cards[0].badges).toEqual(['新入荷', '値下げ', '予約']);
    expect(result.cards[1]).toMatchObject({ primaryPrice: null, officialAvailability: 'in_stock' });
  });

  it('skips untitled Suruga cards and maps rank B stock', () => {
    const html = `<a href="/product/detail/1"></a>
      <a href="/product/detail/2">sample ranked</a><span>中古：￥3,000 ランクB</span>`;
    const result = parseSurugayaSearch(html);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({ productId: '2', condition: 'used_rank_b' });
  });
});
