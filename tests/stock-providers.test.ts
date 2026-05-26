import { describe, expect, it } from 'vitest';
import { isAllowedHttpTarget } from '@/lib/url-allowlist';
import {
  STOCK_PROVIDER_IDS,
  parseGenericProviderPage,
  parseErogePrice,
  parseHgame1Detail,
  parseMelonbooksDetail,
  parseSofmapDetail,
  parseTraderList,
  parseWondergooDetail,
} from '@/lib/stock';

const target = { url: 'https://example.test/item', releaseId: 'r90001', jan: '4900000000000' };

describe('stock provider coverage', () => {
  it('registers every shop required by the stock lookup surface', () => {
    expect(STOCK_PROVIDER_IDS).toEqual([
      'eroge_price',
      'sofmap',
      'surugaya',
      'hgame1',
      'melonbooks',
      'mandarake',
      'wondergoo',
      'trader',
      'animate',
      'ebten',
      'getchu',
      'gamers',
      'gamecity',
      'asakusa_mach',
      'amazon_jp',
      'amiami',
      'otakarasouko',
      'geo',
      'joshin',
      'neowing',
      'yodobashi',
      'bikkuri_takarajima',
    ]);
  });

  it.each([
    'https://a.sofmap.com/product_detail.aspx?sku=100000000',
    'https://www.suruga-ya.jp/product/detail/100000000',
    'https://eroge-price.com/games/90001',
    'https://www.hgame1.com/item/4900000000000.html',
    'https://www.melonbooks.co.jp/detail/detail.php?product_id=90001',
    'https://order.mandarake.co.jp/order/detailPage/item?itemCode=90001',
    'https://www.wonder.co.jp/benefit/game/detail/?id=90001',
    'https://trader.co.jp/shop/shopbrand.html?search=sample',
    'https://www.animate-onlineshop.jp/products/list.php?smt=sample',
    'https://store.kadokawa.co.jp/shop/goods/search.aspx?keyword=sample',
    'https://www.getchu.com/php/nsearch.phtml?search_keyword=sample',
    'https://www.gamers.co.jp/products/list.php?mode=search&smt=sample',
    'https://shop.gamecity.ne.jp/goods-search/?k=sample',
    'https://shopping.yahoo.co.jp/search/sample/0/',
    'https://www.amazon.co.jp/s?k=sample',
    'https://www.amiami.jp/top/search/list?s_keywords=sample',
    'https://www.ec.otakarasouko.com/shop/shopbrand.html?search=&sort=order&prize1=sample',
    'https://ec.geo-online.co.jp/shop/goods/search.aspx?keyword=sample',
    'https://joshinweb.jp/srhzs.html?QK=sample',
    'https://www.neowing.co.jp/searchuni?q=sample',
    'https://www.yodobashi.com/?word=sample',
    'https://beak-takarajima.celosia.co.jp/shop/shopbrand.html?search=&sort=order&prize1=sample',
  ])('allows stock provider host %s', (url) => {
    expect(isAllowedHttpTarget(url)).toBe(true);
  });
});

describe('stock provider parsers', () => {
  it('parses Sofmap detail price and limited stock', () => {
    const offer = parseSofmapDetail(
      `<h1>Sample Title</h1>
       <table><tr><th>ソフマップ特価</th><td><span class="price"><strong>&yen;5,280</strong>(税込)</span></td></tr>
       <tr><th>在庫</th><td><span>数量限定</span><span>店舗から発送いたします</span></td></tr></table>`,
      'https://a.sofmap.com/product_detail.aspx?sku=90001',
      target,
    );
    expect(offer).toMatchObject({ title: 'Sample Title', price: 5280, availability: 'limited' });
  });

  it('parses Unoya stock code and tax-included price', () => {
    const offer = parseHgame1Detail(
      `<h1>Sample Title</h1><tr><th>販売価格</th><td><h4>2,780円</h4></td></tr>
       <input type="hidden" name="price" value="2780">
       <th>数量</th><td>在庫の状況<SCRIPT> switch(parseInt("2")){}</SCRIPT></td>`,
      'https://www.hgame1.com/item/4900000000000.html',
      target,
    );
    expect(offer).toMatchObject({ price: 2780, availability: 'limited', availability_label: '1' });
  });

  it('parses Melonbooks price and inventory label', () => {
    const offer = parseMelonbooksDetail(
      `<h1 class="page-header">Sample Title</h1>
       <p class="price"><span class="price--currency">¥</span><span class="price--value">10,978&nbsp;</span></p>
       <span class="product-info__inventory-status__text">残りわずか</span>`,
      'https://www.melonbooks.co.jp/detail/detail.php?product_id=90001',
      target,
    );
    expect(offer).toMatchObject({ price: 10978, availability: 'limited', availability_label: '残りわずか' });
  });

  it('parses Eroge Price aggregate table rows', () => {
    const offers = parseErogePrice(
      `<title>Sample Title</title><table><tbody>
       <tr><td>Shop A</td><td>パッケージ版</td><td>¥1,830</td><td>通常 / 中古</td><td>-</td></tr>
       </tbody></table>`,
      'https://eroge-price.com/games/90001',
      'v90001',
      123,
    );
    expect(offers[0]).toMatchObject({ provider: 'eroge_price', price: 1830, location_label: 'Shop A' });
  });

  it('parses WonderGOO bonus pages as shop presence without false out-of-stock', () => {
    const offer = parseWondergooDetail(
      `<title>Sample Limited Set - WonderGOO</title><p>品切れの際はご容赦下さい。</p>`,
      'https://www.wonder.co.jp/benefit/game/detail/?id=90001',
      target,
    );
    expect(offer).toMatchObject({ availability: 'unknown', edition_label: 'Store bonus' });
  });

  it('parses Trader list rows into individual offers', () => {
    const offers = parseTraderList(
      `<li><div class="innerBox"><p class="name"><a href=/shop/shopdetail.html?brandcode=000000090001>Sample Limited Box</a></p>
       <div class="btnWrap"><p class="price"> 19,800円(税込)</p></div></div></li>`,
      'https://trader.co.jp/shop/shopbrand.html?search=sample',
      target,
    );
    expect(offers[0]).toMatchObject({ price: 19800, availability: 'in_stock', edition_label: 'Store bonus' });
  });

  it('parses Animate search cards with status text', () => {
    const offers = parseGenericProviderPage(
      'animate',
      `<li><div class="item_list_class"><p><span>特典あり</span></p></div>
       <div class="item_list_thumb"><a href="/pd/3470664/"><img title="Sample VN Animate Set"></a></div>
       <h3><a href="/pd/3470664/" title="Sample VN Animate Set">Sample VN Animate Set</a></h3>
       <div class="item_list_detail"><p class="price"><font>39,050</font>円(税込)</p>
       <p class="stock">販売状況：<span>予約受付中</span></p></div></li>`,
      'https://www.animate-onlineshop.jp/products/list.php?smt=Sample%20VN',
      { ...target, query: 'Sample VN' },
    );
    expect(offers[0]).toMatchObject({ price: 39050, availability: 'in_stock', location_label: 'Animate' });
  });

  it('parses ebten thumbnail cards', () => {
    const offers = parseGenericProviderPage(
      'ebten',
      `<dl class="block-thumbnail-t--goods js-enhanced-ecommerce-item">
       <a href="/shop/g/g7015026091056/" class="js-enhanced-ecommerce-goods-name">Sample VN DX Pack Windows</a>
       <span class="stock">予約受付中</span>
       <div class="block-thumbnail-t--price price js-enhanced-ecommerce-goods-price">53,900<span class="yen">円</span></div>
       </dl>`,
      'https://store.kadokawa.co.jp/shop/goods/search.aspx?keyword=Sample%20VN',
      { ...target, query: 'Sample VN' },
    );
    expect(offers[0]).toMatchObject({ price: 53900, availability: 'in_stock', location_label: 'ebten' });
  });

  it('parses Getchu list cards', () => {
    const offers = parseGenericProviderPage(
      'getchu',
      `<li><div class="content_block"><A HREF="../soft.phtml?id=1367640" class="blueb">Sample VN DX Pack</A>
       特典付き価格（税込）：<SPAN class="redb">￥30,800</SPAN><!--予約--></div></li>`,
      'https://www.getchu.com/php/nsearch.phtml?search_keyword=Sample%20VN',
      { ...target, query: 'Sample VN' },
    );
    expect(offers[0]).toMatchObject({ price: 30800, availability: 'in_stock', location_label: 'Getchu' });
  });

  it('parses Gamers list products', () => {
    const offers = parseGenericProviderPage(
      'gamers',
      `<li class="list_product"><a href="/pn/sample/pd/10895235/"><h3 class="item_list_ttl txt_wrap">Sample VN Gamers Edition</h3>
       <p class="price">37,400円(税込)</p><p class="sell">販売状況：<span>予約受付中</span></p></a></li>`,
      'https://www.gamers.co.jp/products/list.php?smt=Sample%20VN',
      { ...target, query: 'Sample VN' },
    );
    expect(offers[0]).toMatchObject({ price: 37400, availability: 'in_stock', location_label: 'Gamers' });
  });

  it('parses GEO result cards', () => {
    const offers = parseGenericProviderPage(
      'geo',
      `<li><a class="sendDatalayer" href="https://ec.geo-online.co.jp/shop/g/g515861501/">
       <span class="labelNow reserve">予約受付中</span><span class="labelSituation new">新品</span>
       <h3 class="itemName">Sample VN</h3><div class="sellPtnLeftPrice"><b>7,450</b><span>円</span></div></a></li>`,
      'https://ec.geo-online.co.jp/shop/goods/search.aspx?keyword=Sample%20VN',
      { ...target, query: 'Sample VN' },
    );
    expect(offers[0]).toMatchObject({ price: 7450, availability: 'in_stock', condition: '新品' });
  });

  it('parses Joshin result cards', () => {
    const offers = parseGenericProviderPage(
      'joshin',
      `<div class="search_container_name"><a href="/game/46584/4935066901403.html">Sample VN Joshin Edition</a></div>
       <div class="search_container_price"><div class="price"><span class="fsL">7,720</span><span>円(税込)</span></div></div>
       <div class="search_container_stock"><div class="yoyaku">予約受付中</div><div class="nouki"></div></div><div class="search_container_review"></div>`,
      'https://joshinweb.jp/srhzs.html?QK=Sample%20VN',
      { ...target, query: 'Sample VN' },
    );
    expect(offers[0]).toMatchObject({ price: 7720, availability: 'in_stock', location_label: 'Joshin' });
  });

  it('parses Yodobashi product tiles', () => {
    const offers = parseGenericProviderPage(
      'yodobashi',
      `<div class="srcResultItem_block pListBlock productListTile"><a href="/product/100000001009050473/">
       <div class="pName fs14"><p>Brand</p><p>Sample VN Acrylic Stand</p></div></a>
       <span class="productPrice">￥2,000</span><span class="green">在庫残少</span></div><!-- /pListBlock -->`,
      'https://www.yodobashi.com/?word=Sample%20VN',
      { ...target, query: 'Sample VN' },
    );
    expect(offers[0]).toMatchObject({ price: 2000, availability: 'limited', location_label: 'Yodobashi' });
  });

  it('parses Amazon search results', () => {
    const offers = parseGenericProviderPage(
      'amazon_jp',
      `<div role="listitem" data-asin="B0GYS9CMJF" data-component-type="s-search-result">
       <a href="/Sample-VN/dp/B0GYS9CMJF/ref=sr_1_1"><h2 aria-label="Sample VN Switch"><span>Sample VN Switch</span></h2></a>
       <span class="a-offscreen">￥7,573</span><span>予約商品の価格保証</span></div>`,
      'https://www.amazon.co.jp/s?k=Sample%20VN',
      { ...target, query: 'Sample VN' },
    );
    expect(offers[0]).toMatchObject({ provider_offer_id: 'B0GYS9CMJF', price: 7573, availability: 'in_stock' });
  });

  it('parses Yahoo Shopping result cards', () => {
    const offers = parseGenericProviderPage(
      'asakusa_mach',
      `<a href="https://store.shopping.yahoo.co.jp/shop/sample.html" data-beacon="tname:新品 Sample VN 通常版;prc:7780;text:予約">
       <span class="ItemTitle_SearchResultItemTitle__fy4bB">新品 Sample VN 通常版</span></a>
       <span class="ItemPrice_ItemPrice__2t7fx">7,780<span>円</span></span>`,
      'https://shopping.yahoo.co.jp/search/Sample%20VN/0/',
      { ...target, query: 'Sample VN' },
    );
    expect(offers[0]).toMatchObject({ price: 7780, availability_label: '予約', location_label: 'Yahoo Shopping' });
  });

  it('filters broad shop search results by the original title query', () => {
    const offers = parseGenericProviderPage(
      'bikkuri_takarajima',
      `<li><div class="innerBox"><p class="name"><a href=/shop/shopdetail.html?brandcode=000000007118>Completely Different Game</a></p>
       <p class="price">10,780円</p></div></li>`,
      'https://beak-takarajima.celosia.co.jp/shop/shopbrand.html?search=&prize1=Sample%20VN',
      { ...target, query: 'Sample VN' },
    );
    expect(offers).toEqual([]);
  });

  it('does not create title-only offers from empty dynamic search pages', () => {
    const offers = parseGenericProviderPage(
      'neowing',
      `<title>検索結果 - Neowing</title><ul id="js-search-result"></ul>`,
      'https://www.neowing.co.jp/searchuni?q=Sample%20VN',
      { ...target, releaseId: null, query: 'Sample VN' },
    );
    expect(offers).toEqual([]);
  });
});
