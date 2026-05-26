import { describe, expect, it } from 'vitest';
import { isAllowedHttpTarget } from '@/lib/url-allowlist';
import {
  STOCK_PROVIDER_IDS,
  PHYSICAL_CAPABLE_PROVIDER_IDS,
  CONFIRMED_PHYSICAL_PROVIDER_IDS,
  USELESS_FOR_CONFIRMED_PHYSICAL_STOCK,
  getProviderMeta,
  canProduceConfirmedPhysicalStock,
  canProducePotentialPhysicalLead,
  shouldShowInConfirmedPhysicalResults,
  shouldShowAsPhysicalLead,
  parseGenericProviderPage,
  parseErogePrice,
  parseHgame1Detail,
  parseMandarakeDetail,
  parseMelonbooksDetail,
  parseSofmapDetail,
  parseSofmapList,
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
  it('parses Sofmap product_list_parts.aspx per-store items', () => {
    const html = `<ul id="change_style_list" class="product_list">
      <li><div class="mainbox">
        <a href="https://a.sofmap.com/product_detail.aspx?sku=414997619" class="itemimg"><img alt="Sample VN"></a>
        <a href="https://a.sofmap.com/product_detail.aspx?sku=414997619" class="product_name">〔中古品〕 Sample VN【PCゲームソフト】</a>
        <a href="https://a.sofmap.com/product_detail.aspx?sku=414997619" class="product_name product_name_type_list" style="display:none;">〔中古品〕 Sample VN【PCゲームソフト】</a>
        <span class="price"><strong>&yen;2,980<i>(税込)</i></strong></span>
        <!-- stock_disp_id : TENPO_IN_STOCK --><span class="ic stock inshop">店舗併売品</span>
        <dl class="used_link shop"><dd><a href="https://www.sofmap.com/tenpo/contents/?id=shops&sid=akiba_ams">AKIBA アミューズメント館</a></dd></dl>
      </div></li>
      <li><div class="mainbox">
        <a href="https://a.sofmap.com/product_detail.aspx?sku=414731757" class="itemimg"><img alt="Sample VN"></a>
        <a href="https://a.sofmap.com/product_detail.aspx?sku=414731757" class="product_name">〔中古品〕 Sample VN【PCゲームソフト】</a>
        <span class="price"><strong>&yen;2,980<i>(税込)</i></strong></span>
        <!-- stock_disp_id : TENPO_IN_STOCK --><span class="ic stock inshop">店舗併売品</span>
        <dl class="used_link shop"><dd><a href="https://www.sofmap.com/tenpo/contents/?id=shops&sid=oomiya">大宮店</a></dd></dl>
      </div></li>
    </ul>`;
    const offers = parseSofmapList(html, { ...target, query: 'Sample VN', jan: '4989061101573' });
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      provider_offer_id: '414997619',
      title: '〔中古品〕 Sample VN【PCゲームソフト】',
      price: 2980,
      availability: 'in_stock',
      condition: 'Used',
      location_label: 'AKIBA アミューズメント館',
      location_branch: 'AKIBA アミューズメント館',
    });
    expect(offers[1]).toMatchObject({
      provider_offer_id: '414731757',
      location_label: '大宮店',
      location_branch: '大宮店',
    });
  });

  it('parseSofmapList returns empty array when no change_style_list present', () => {
    const offers = parseSofmapList('<title>PCゲーム</title><h1>PCゲーム</h1>', target);
    expect(offers).toEqual([]);
  });

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

  it('parseMandarakeDetail returns offer from a typical product page', () => {
    const html = `<html><head><title>Sample VN - まんだらけ</title></head><body>
      <h1>Sample Visual Novel Deluxe Box</h1>
      <p class="price">価格: <strong>4,800</strong>円（税込）</p>
      <p>状態：中古 開封済み</p>
      <p class="availability">在庫あり</p>
    </body></html>`;
    const url = 'https://order.mandarake.co.jp/order/detailPage/item?itemCode=1099012345&ref=list';
    const offer = parseMandarakeDetail(html, url, target);
    expect(offer).not.toBeNull();
    expect(offer).toMatchObject({
      provider_offer_id: '1099012345',
      price: 4800,
      availability: 'in_stock',
      condition: 'Used',
      location_label: 'Mandarake',
    });
  });

  it('parseMandarakeDetail returns null for Cloudflare-blocked page', () => {
    const html = `<html><head><title>MANDARAKE</title></head><body><p>Access denied</p></body></html>`;
    const url = 'https://order.mandarake.co.jp/order/detailPage/item?itemCode=1099000000';
    expect(parseMandarakeDetail(html, url, target)).toBeNull();
  });

  it('parseMandarakeDetail uses JAN from target when no itemCode in URL', () => {
    const html = `<html><head><title>Sample VN - Mandarake</title></head><body>
      <h1>Sample Visual Novel</h1><p>価格: 3,200円</p>
    </body></html>`;
    const url = 'https://order.mandarake.co.jp/order/listPage/list?keyword=sample';
    const janTarget = { ...target, jan: '4912345678901' };
    const offer = parseMandarakeDetail(html, url, janTarget);
    expect(offer).not.toBeNull();
    expect(offer?.provider_offer_id).toBe('4912345678901');
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

describe('PHYSICAL_CAPABLE_PROVIDER_IDS', () => {
  it('contains all expected physical-capable providers', () => {
    expect(PHYSICAL_CAPABLE_PROVIDER_IDS).toEqual(
      expect.arrayContaining(['sofmap', 'surugaya', 'hgame1', 'mandarake', 'wondergoo', 'trader', 'animate', 'otakarasouko', 'geo', 'joshin', 'yodobashi', 'bikkuri_takarajima']),
    );
  });

  it('contains only IDs that are present in STOCK_PROVIDER_IDS', () => {
    const all = new Set(STOCK_PROVIDER_IDS);
    for (const id of PHYSICAL_CAPABLE_PROVIDER_IDS) {
      expect(all.has(id), `${id} in PHYSICAL_CAPABLE_PROVIDER_IDS but not in STOCK_PROVIDER_IDS`).toBe(true);
    }
  });

  it('does not contain alicesoft_kobe (cached provider)', () => {
    expect(PHYSICAL_CAPABLE_PROVIDER_IDS).not.toContain('alicesoft_kobe');
  });
});

describe('CONFIRMED_PHYSICAL_PROVIDER_IDS', () => {
  it('is a strict subset of PHYSICAL_CAPABLE_PROVIDER_IDS', () => {
    const capable = new Set(PHYSICAL_CAPABLE_PROVIDER_IDS);
    for (const id of CONFIRMED_PHYSICAL_PROVIDER_IDS) {
      expect(capable.has(id), `${id} in CONFIRMED but not in CAPABLE`).toBe(true);
    }
  });

  it('contains sofmap and hgame1 (parsers implemented)', () => {
    expect(CONFIRMED_PHYSICAL_PROVIDER_IDS).toEqual(expect.arrayContaining(['sofmap', 'hgame1']));
  });

  it('does not contain unconfirmed providers (wondergoo, trader, mandarake)', () => {
    expect(CONFIRMED_PHYSICAL_PROVIDER_IDS).not.toContain('wondergoo');
    expect(CONFIRMED_PHYSICAL_PROVIDER_IDS).not.toContain('trader');
    expect(CONFIRMED_PHYSICAL_PROVIDER_IDS).not.toContain('mandarake');
  });

  it('does not contain alicesoft_kobe (cached provider, not StockProviderId)', () => {
    expect(CONFIRMED_PHYSICAL_PROVIDER_IDS).not.toContain('alicesoft_kobe');
  });
});

describe('USELESS_FOR_CONFIRMED_PHYSICAL_STOCK', () => {
  it('contains wondergoo and trader (store-locator / phone-only)', () => {
    expect(USELESS_FOR_CONFIRMED_PHYSICAL_STOCK).toEqual(
      expect.arrayContaining(['wondergoo', 'trader', 'otakarasouko', 'bikkuri_takarajima', 'joshin']),
    );
  });

  it('contains online-only providers', () => {
    expect(USELESS_FOR_CONFIRMED_PHYSICAL_STOCK).toEqual(
      expect.arrayContaining(['melonbooks', 'ebten', 'getchu', 'gamers', 'gamecity', 'asakusa_mach', 'amazon_jp', 'amiami', 'neowing']),
    );
  });

  it('does NOT contain sofmap or hgame1 (confirmed physical)', () => {
    expect(USELESS_FOR_CONFIRMED_PHYSICAL_STOCK).not.toContain('sofmap');
    expect(USELESS_FOR_CONFIRMED_PHYSICAL_STOCK).not.toContain('hgame1');
  });

  it('contains only IDs present in STOCK_PROVIDER_IDS', () => {
    const all = new Set(STOCK_PROVIDER_IDS);
    for (const id of USELESS_FOR_CONFIRMED_PHYSICAL_STOCK) {
      expect(all.has(id), `${id} in USELESS list but not in STOCK_PROVIDER_IDS`).toBe(true);
    }
  });
});

describe('getProviderMeta', () => {
  it('returns metadata for sofmap', () => {
    const m = getProviderMeta('sofmap');
    expect(m?.physicalStockMode).toBe('exact_online');
    expect(m?.branchParserImplemented).toBe(true);
    expect(m?.confirmedPhysicalUsable).toBe(true);
  });

  it('returns metadata for alicesoft_kobe (cached)', () => {
    const m = getProviderMeta('alicesoft_kobe');
    expect(m?.physicalStockMode).toBe('exact_cached');
    expect(m?.confirmedPhysicalUsable).toBe(true);
  });

  it('returns metadata for surugaya — browser_required + cloudflare true', () => {
    const m = getProviderMeta('surugaya');
    expect(m?.physicalStockMode).toBe('exact_online_browser_required');
    expect(m?.cloudflare).toBe(true);
    expect(m?.confirmedPhysicalUsable).toBe(false);
  });

  it('returns metadata for wondergoo — store_locator_only, not confirmed', () => {
    const m = getProviderMeta('wondergoo');
    expect(m?.physicalStockMode).toBe('store_locator_only');
    expect(m?.confirmedPhysicalUsable).toBe(false);
  });

  it('returns metadata for trader — phone_only', () => {
    expect(getProviderMeta('trader')?.physicalStockMode).toBe('phone_only');
  });

  it('returns undefined for unknown id', () => {
    expect(getProviderMeta('unknown_provider' as never)).toBeUndefined();
  });
});

describe('canProduceConfirmedPhysicalStock', () => {
  it('true for sofmap and hgame1', () => {
    expect(canProduceConfirmedPhysicalStock('sofmap')).toBe(true);
    expect(canProduceConfirmedPhysicalStock('hgame1')).toBe(true);
  });

  it('true for alicesoft_kobe', () => {
    expect(canProduceConfirmedPhysicalStock('alicesoft_kobe')).toBe(true);
  });

  it('false for wondergoo, trader, surugaya, mandarake', () => {
    expect(canProduceConfirmedPhysicalStock('wondergoo')).toBe(false);
    expect(canProduceConfirmedPhysicalStock('trader')).toBe(false);
    expect(canProduceConfirmedPhysicalStock('surugaya')).toBe(false);
    expect(canProduceConfirmedPhysicalStock('mandarake')).toBe(false);
  });

  it('false for online-only providers', () => {
    expect(canProduceConfirmedPhysicalStock('amazon_jp')).toBe(false);
    expect(canProduceConfirmedPhysicalStock('melonbooks')).toBe(false);
  });
});

describe('canProducePotentialPhysicalLead', () => {
  it('true for physical-capable providers with non-none modes', () => {
    expect(canProducePotentialPhysicalLead('sofmap')).toBe(true);
    expect(canProducePotentialPhysicalLead('surugaya')).toBe(true);
    expect(canProducePotentialPhysicalLead('hgame1')).toBe(true);
    expect(canProducePotentialPhysicalLead('wondergoo')).toBe(true);
    expect(canProducePotentialPhysicalLead('trader')).toBe(true);
    expect(canProducePotentialPhysicalLead('mandarake')).toBe(true);
  });

  it('false for online-only providers even if physical:false', () => {
    expect(canProducePotentialPhysicalLead('amazon_jp')).toBe(false);
    expect(canProducePotentialPhysicalLead('melonbooks')).toBe(false);
    expect(canProducePotentialPhysicalLead('eroge_price')).toBe(false);
  });
});

describe('shouldShowInConfirmedPhysicalResults', () => {
  it('true for sofmap in_stock with location_label', () => {
    expect(shouldShowInConfirmedPhysicalResults({
      provider: 'sofmap', availability: 'in_stock', location_label: 'Recole Akihabara',
    })).toBe(true);
  });

  it('false when availability is out_of_stock', () => {
    expect(shouldShowInConfirmedPhysicalResults({
      provider: 'sofmap', availability: 'out_of_stock', location_label: 'Recole Akihabara',
    })).toBe(false);
  });

  it('false when location_label is null', () => {
    expect(shouldShowInConfirmedPhysicalResults({
      provider: 'sofmap', availability: 'in_stock', location_label: null,
    })).toBe(false);
  });

  it('false when location_label is "Online stock" (generic)', () => {
    expect(shouldShowInConfirmedPhysicalResults({
      provider: 'sofmap', availability: 'in_stock', location_label: 'Online stock',
    })).toBe(false);
  });

  it('false for wondergoo even with in_stock + location (not confirmedPhysicalUsable)', () => {
    expect(shouldShowInConfirmedPhysicalResults({
      provider: 'wondergoo', availability: 'in_stock', location_label: 'WonderGOO Akiba',
    })).toBe(false);
  });
});

describe('shouldShowAsPhysicalLead', () => {
  it('true for physical provider that is in_stock', () => {
    expect(shouldShowAsPhysicalLead({ provider: 'wondergoo', availability: 'in_stock' })).toBe(true);
    expect(shouldShowAsPhysicalLead({ provider: 'trader', availability: 'unknown' })).toBe(true);
  });

  it('false for physical provider that is out_of_stock', () => {
    expect(shouldShowAsPhysicalLead({ provider: 'sofmap', availability: 'out_of_stock' })).toBe(false);
  });

  it('false for online-only provider', () => {
    expect(shouldShowAsPhysicalLead({ provider: 'amazon_jp', availability: 'in_stock' })).toBe(false);
    expect(shouldShowAsPhysicalLead({ provider: 'melonbooks', availability: 'in_stock' })).toBe(false);
  });
});
