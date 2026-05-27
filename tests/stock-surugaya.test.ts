import { describe, expect, it } from 'vitest';
import { buildSurugayaSearchUrl, parseSurugayaSearch } from '@/lib/stock';

describe('buildSurugayaSearchUrl', () => {
  it('uses URLSearchParams, never raw & concatenation', () => {
    const url = buildSurugayaSearchUrl('サンプル3');
    expect(url).not.toContain('&amp;');
    // サンプル3 = %E3%82%B5%E3%83%B3%E3%83%97%E3%83%AB3 (UTF-8 percent-encoded)
    expect(url).toContain('search_word=%E3%82%B5%E3%83%B3%E3%83%97%E3%83%AB3');
    expect(url).toContain('category=');
    expect(url).toContain('rankBy=relavancy');
  });

  it('adds page param only for page > 1', () => {
    expect(buildSurugayaSearchUrl('test')).not.toContain('page=');
    expect(buildSurugayaSearchUrl('test', 1)).not.toContain('page=');
    expect(buildSurugayaSearchUrl('test', 2)).toContain('page=2');
    expect(buildSurugayaSearchUrl('test', 3)).toContain('page=3');
  });

  it('base hostname is www.suruga-ya.jp/search', () => {
    const url = buildSurugayaSearchUrl('test');
    expect(url.startsWith('https://www.suruga-ya.jp/search?')).toBe(true);
  });
});

describe('parseSurugayaSearch — CF detection', () => {
  it('does NOT flag normal page with Cloudflare JS as blocked', () => {
    const html = `<!DOCTYPE html><html><head><title>サーチ結果 | 駿河屋</title>
    <script>/* cloudflare browser check */</script></head>
    <body><p class="search_count">1-2件 / 2件</p>
    <a href="/product/detail/12345">サンプル3Cute [通常版]</a>
    <span class="item_kind">ニンテンドースイッチソフト</span>
    </body></html>`;
    const result = parseSurugayaSearch(html);
    expect(result.cards.length).toBeGreaterThan(0);
  });
});

const FIXTURE_HTML = `<!DOCTYPE html>
<html>
<head><title>サーチ結果 | 駿河屋</title></head>
<body>
<div class="search_result_area">
  <p class="search_count">1-3件 / 29件</p>

  <!-- Card 1: game package, official sold out, marketplace available -->
  <div class="item_box">
    <a href="/product/detail/592867?category=&search_word=%E3%82%A2%E3%82%A4%E3%82%AD%E3%82%B93">
      <img src="https://shinaban.suruga-ya.jp/img/goods/592867/main.jpg" alt="メイン画像">
    </a>
    <p class="item_name"><a href="/product/detail/592867">サンプル3Cute [通常版]</a></p>
    <p class="item_kind_type">ニンテンドースイッチソフト</p>
    <div class="price_block">
      <p>品切れ</p>
      <p>定価：￥7,678</p>
      <p>マケプレ ￥4,270 (2点の中古品)</p>
    </div>
  </div>

  <!-- Card 2: bonus item [単品] prefix -->
  <div class="item_box">
    <p class="item_name"><a href="/product/other/12345">[単品] サンプル花子 アクリルスタンド 「PS4/Switchソフト サンプル3Cute WonderGOO限定セット」 同梱特典</a></p>
    <p class="item_kind_type">アクリルスタンド・アクリルパネル</p>
    <div class="price_block">
      <p>中古：￥500</p>
    </div>
  </div>

  <!-- Card 3: store-linked result with tenpo_cd -->
  <div class="item_box">
    <p class="item_name"><a href="/product/detail/99999?tenpo_cd=AKIBA01">サンプル3Cute [限定版]</a></p>
    <p class="item_kind_type">ニンテンドースイッチソフト</p>
    <div class="price_block">
      <p>中古：￥8,500</p>
    </div>
  </div>

  <!-- Shipping fee section — must NOT contribute to price parsing -->
  <div class="shipping_area">5,000円未満のご注文は送料がかかります。1,500円以上送料無料。</div>
</div>
</body></html>`;

describe('parseSurugayaSearch — card parsing', () => {
  const result = parseSurugayaSearch(FIXTURE_HTML);

  it('parses pagination correctly', () => {
    expect(result.pagination).toEqual({ start: 1, end: 3, total: 29 });
  });

  it('returns 3 cards', () => {
    expect(result.cards).toHaveLength(3);
  });

  it('card 1: productId and pageKind', () => {
    expect(result.cards[0].productId).toBe('592867');
    expect(result.cards[0].pageKind).toBe('detail');
  });

  it('card 1: title', () => {
    expect(result.cards[0].title).toBe('サンプル3Cute [通常版]');
  });

  it('card 1: category', () => {
    expect(result.cards[0].category).toBe('ニンテンドースイッチソフト');
  });

  it('card 1: 品切れ → official out_of_stock', () => {
    expect(result.cards[0].officialAvailability).toBe('out_of_stock');
  });

  it('card 1: listPrice = 7678', () => {
    expect(result.cards[0].listPrice).toBe(7678);
  });

  it('card 1: primaryPrice = null (official sold out)', () => {
    expect(result.cards[0].primaryPrice).toBeNull();
  });

  it('card 1: marketplacePrice = 4270', () => {
    expect(result.cards[0].marketplacePrice).toBe(4270);
  });

  it('card 1: marketplaceCount = 2', () => {
    expect(result.cards[0].marketplaceCount).toBe(2);
  });

  it('card 1: url points to /product/detail/592867 (no search params)', () => {
    expect(result.cards[0].url).toBe('https://www.suruga-ya.jp/product/detail/592867');
  });

  it('card 2: [単品] bonus item — pageKind = other', () => {
    expect(result.cards[1].productId).toBe('12345');
    expect(result.cards[1].pageKind).toBe('other');
  });

  it('card 2: primaryPrice = 500 (used in stock)', () => {
    expect(result.cards[1].primaryPrice).toBe(500);
    expect(result.cards[1].officialAvailability).toBe('in_stock');
  });

  it('card 3: tenpo_cd extracted as storeCode', () => {
    expect(result.cards[2].storeCode).toBe('AKIBA01');
  });

  it('card 3: productId = 99999', () => {
    expect(result.cards[2].productId).toBe('99999');
  });

  it('does NOT produce price=5 from "5,000円未満" shipping text', () => {
    for (const card of result.cards) {
      expect(card.primaryPrice).not.toBe(5);
      expect(card.marketplacePrice).not.toBe(5);
      expect(card.listPrice).not.toBe(5);
    }
  });

  it('does NOT produce price=5000 from shipping text on card 1', () => {
    expect(result.cards[0].primaryPrice).toBeNull();
    expect(result.cards[0].listPrice).toBe(7678);
  });
});

const BRANCH_FIXTURE_HTML = `<!DOCTYPE html>
<html><body>
<p class="search_count">1-1件 / 1件</p>
<div class="item_box">
  <p class="item_name"><a href="/product/detail/77777?branch_number=BR001">テスト商品</a></p>
  <p class="item_kind_type">ニンテンドースイッチソフト</p>
  <div class="price_block"><p>中古：￥3,000</p></div>
</div>
</body></html>`;

describe('parseSurugayaSearch — branch_number', () => {
  it('parses branch_number from product URL', () => {
    const result = parseSurugayaSearch(BRANCH_FIXTURE_HTML);
    expect(result.cards[0].branchNumber).toBe('BR001');
    expect(result.cards[0].storeCode).toBeNull();
  });
});

const CF_CHALLENGE_HTML = `<!DOCTYPE html>
<html><head><title>Just a moment...</title></head>
<body>Please wait while we check your browser...</body></html>`;

const CF_CHLOPT_HTML = `<!DOCTYPE html>
<html><head><title>駿河屋</title></head>
<body><script>window._cf_chl_opt={cRay:"abc"};</script></body></html>`;

describe('CF challenge detection', () => {
  it('Just a moment title → 0 cards (CF challenge page)', () => {
    const result = parseSurugayaSearch(CF_CHALLENGE_HTML);
    expect(result.cards).toHaveLength(0);
    expect(result.pagination).toBeNull();
  });

  it('window._cf_chl_opt → 0 cards (CF challenge page)', () => {
    const result = parseSurugayaSearch(CF_CHLOPT_HTML);
    expect(result.cards).toHaveLength(0);
  });
});
