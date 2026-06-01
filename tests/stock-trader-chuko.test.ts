import { describe, expect, it } from 'vitest';
import {
  encodeEucJpQuery,
  traderSearchVariants,
  parseTraderChukoSmartphoneList,
  parseTraderChukoDetail,
} from '@/lib/stock';

const BASE_URL = 'https://www.chuko-tsuhan.com/smartphone/list.html?search_key=test';
const DETAIL_BASE = 'https://www.chuko-tsuhan.com/smartphone/';

const BLANK_TARGET = { url: BASE_URL, releaseId: null, jan: null };

function makeListHtml(items: string): string {
  return `<!DOCTYPE html><html><body><ul>${items}</ul></body></html>`;
}

function listItem({
  id,
  title,
  price,
  soldOut = false,
}: {
  id: string;
  title: string;
  price?: number;
  soldOut?: boolean;
}): string {
  const priceHtml = price != null ? `<p class="price"><em>${price.toLocaleString('ja-JP')}</em>円(税込)</p>` : '';
  const soldOutHtml = soldOut ? `<p class="soldout">売り切れ</p>` : '';
  return `<li>
  <a href="detail.html?id=${id}&amp;category_code=&amp;page=1">
    <img src="img/${id}.jpg" alt="${title}">
    <p>${title}</p>
    ${priceHtml}
    ${soldOutHtml}
  </a>
</li>`;
}

describe('encodeEucJpQuery', () => {
  it('produces EUC-JP percent encoding, not UTF-8', () => {
    const result = encodeEucJpQuery('テスト');
    expect(result).not.toContain('%E3%83%86');
    expect(result).not.toContain('%E3%82%B9');
    expect(result).not.toContain('%E3%83%88');
    expect(result).toMatch(/^(%[0-9A-F]{2})+$/);
  });

  it('encodes ASCII characters as plain percent-encoded bytes', () => {
    const result = encodeEucJpQuery('abc');
    expect(result).toBe('%61%62%63');
  });

  it('encodes a multi-character Japanese string without UTF-8 bytes', () => {
    const utf8Encoded = encodeURIComponent('架空ゲーム');
    const eucEncoded = encodeEucJpQuery('架空ゲーム');
    expect(eucEncoded).not.toBe(utf8Encoded);
    expect(eucEncoded).toMatch(/^(%[0-9A-F]{2})+$/);
  });
});

describe('traderSearchVariants', () => {
  it('returns exactly 16 variants', () => {
    expect(traderSearchVariants('架空ゲーム')).toHaveLength(16);
  });

  it('first variant is the unmodified base query', () => {
    expect(traderSearchVariants('架空ゲーム')[0]).toBe('架空ゲーム');
  });

  it('includes 店頭併売 suffix variant', () => {
    expect(traderSearchVariants('架空ゲーム')).toContain('架空ゲーム 店頭併売');
  });

  it('includes 【店頭併売】prefix variant', () => {
    expect(traderSearchVariants('架空ゲーム')).toContain('【店頭併売】架空ゲーム');
  });

  it('includes 実店舗, 店舗在庫, 秋葉原トレーダー, 本店, 2号店 variants', () => {
    const variants = traderSearchVariants('架空ゲーム');
    expect(variants).toContain('架空ゲーム 実店舗');
    expect(variants).toContain('架空ゲーム 店舗在庫');
    expect(variants).toContain('架空ゲーム 秋葉原トレーダー');
    expect(variants).toContain('架空ゲーム 本店');
    expect(variants).toContain('架空ゲーム 2号店');
  });

  it('all variants contain the base query string', () => {
    const base = '架空ゲーム2';
    for (const v of traderSearchVariants(base)) {
      expect(v).toContain(base);
    }
  });
});

describe('parseTraderChukoSmartphoneList — in_stock item', () => {
  const html = makeListHtml(listItem({ id: '000000100001', title: '架空ゲーム 初回版', price: 3800 }));
  const result = parseTraderChukoSmartphoneList(html, BASE_URL, BLANK_TARGET);

  it('returns one offer', () => expect(result).toHaveLength(1));

  it('extracts product_id from detail.html?id=', () => {
    expect(result[0].provider_offer_id).toBe('000000100001');
  });

  it('extracts title from img alt attribute', () => {
    expect(result[0].title).toBe('架空ゲーム 初回版');
  });

  it('sets availability to in_stock', () => {
    expect(result[0].availability).toBe('in_stock');
  });

  it('parses the yen price', () => {
    expect(result[0].price).toBe(3800);
  });

  it('sets availability_label to 販売中', () => {
    expect(result[0].availability_label).toBe('販売中');
  });

  it('sets location_label to online shop name', () => {
    expect(result[0].location_label).toBe('Trader Online / 秋葉原トレーダー通販');
  });

  it('sets location_branch to null — no branch confirmation', () => {
    expect(result[0].location_branch).toBeNull();
  });

  it('sets condition to a stable used slug', () => {
    expect(result[0].condition).toBe('used');
  });

  it('builds an absolute detail URL', () => {
    expect(result[0].url).toContain('https://www.chuko-tsuhan.com/smartphone/detail.html');
    expect(result[0].url).toContain('id=000000100001');
  });
});

describe('parseTraderChukoSmartphoneList — sold-out item', () => {
  const html = makeListHtml(listItem({ id: '000000100002', title: '架空ゲーム2 豪華版', soldOut: true }));
  const result = parseTraderChukoSmartphoneList(html, BASE_URL, BLANK_TARGET);

  it('returns one offer', () => expect(result).toHaveLength(1));
  it('sets availability to out_of_stock', () => expect(result[0].availability).toBe('out_of_stock'));
  it('sets price to null when sold out', () => expect(result[0].price).toBeNull());
  it('sets availability_label to 売り切れ', () => expect(result[0].availability_label).toBe('売り切れ'));
});

describe('parseTraderChukoSmartphoneList — title filter', () => {
  it('skips items whose title does not match the target query', () => {
    const html = makeListHtml(
      listItem({ id: '999', title: '関係ない商品 特典' }) +
      listItem({ id: '001', title: '架空ゲーム 初回版', price: 3500 }),
    );
    const target = { ...BLANK_TARGET, query: '架空ゲーム' };
    const result = parseTraderChukoSmartphoneList(html, BASE_URL, target);
    expect(result).toHaveLength(1);
    expect(result[0].provider_offer_id).toBe('001');
  });
});

describe('parseTraderChukoSmartphoneList — edition labels', () => {
  it('labels 初回版 with a stable first-press slug', () => {
    const html = makeListHtml(listItem({ id: '1', title: '架空ゲーム 初回版', price: 4000 }));
    const result = parseTraderChukoSmartphoneList(html, BASE_URL, BLANK_TARGET);
    expect(result[0].edition_label).toBe('first_press');
  });

  it('labels 特典タペストリー with a stable bonus-item slug', () => {
    const html = makeListHtml(listItem({ id: '2', title: '架空ゲーム 特典タペストリー', price: 1000 }));
    const result = parseTraderChukoSmartphoneList(html, BASE_URL, BLANK_TARGET);
    expect(result[0].edition_label).toBe('bonus_item');
  });

  it('labels 限定版 with a stable limited-edition slug', () => {
    const html = makeListHtml(listItem({ id: '3', title: '架空ゲーム 限定版', price: 9800 }));
    const result = parseTraderChukoSmartphoneList(html, BASE_URL, BLANK_TARGET);
    expect(result[0].edition_label).toBe('limited_edition');
  });

  it('returns null edition label for standard titles', () => {
    const html = makeListHtml(listItem({ id: '4', title: '架空ゲーム3', price: 3800 }));
    const result = parseTraderChukoSmartphoneList(html, BASE_URL, BLANK_TARGET);
    expect(result[0].edition_label).toBeNull();
  });
});

describe('parseTraderChukoSmartphoneList — deduplication helper', () => {
  it('deduplicates products found across multiple search variant results', () => {
    const html = makeListHtml(listItem({ id: '12345', title: '架空ゲーム 初回版', price: 3800 }));
    const target = { ...BLANK_TARGET, query: '架空ゲーム' };

    const result1 = parseTraderChukoSmartphoneList(html, BASE_URL, target);
    const result2 = parseTraderChukoSmartphoneList(html, BASE_URL, target);

    const seen = new Set<string>();
    const combined = [];
    for (const offer of [...result1, ...result2]) {
      if (seen.has(offer.provider_offer_id)) continue;
      seen.add(offer.provider_offer_id);
      combined.push(offer);
    }

    expect(combined).toHaveLength(1);
    expect(combined[0].provider_offer_id).toBe('12345');
  });
});

describe('parseTraderChukoDetail — in_stock via product:price:amount meta', () => {
  const detailUrl = `${DETAIL_BASE}detail.html?id=100001&category_code=&page=1`;
  const html = `<!DOCTYPE html><html><head>
    <meta property="og:title" content="架空ゲーム 初回版">
    <meta property="product:price:amount" content="7480">
    <meta property="product:price:currency" content="JPY">
  </head><body>
    <h1>架空ゲーム 初回版</h1>
    <p class="price"><em>7,480</em>円(税込)</p>
  </body></html>`;

  const result = parseTraderChukoDetail(html, detailUrl, null);

  it('returns a non-null offer', () => expect(result).not.toBeNull());
  it('extracts title from og:title', () => expect(result?.title).toBe('架空ゲーム 初回版'));
  it('sets availability to in_stock', () => expect(result?.availability).toBe('in_stock'));
  it('extracts price from product:price:amount meta', () => expect(result?.price).toBe(7480));
  it('sets availability_label to 販売中', () => expect(result?.availability_label).toBe('販売中'));
  it('sets location_branch to null', () => expect(result?.location_branch).toBeNull());
  it('sets location_label to online shop name', () => {
    expect(result?.location_label).toBe('Trader Online / 秋葉原トレーダー通販');
  });
});

describe('parseTraderChukoDetail — in_stock via #taxPrice', () => {
  const detailUrl = `${DETAIL_BASE}detail.html?id=100002`;
  const html = `<!DOCTYPE html><html><body>
    <h1>架空ゲーム2 豪華版</h1>
    <span id="taxPrice">9,380円</span>
  </body></html>`;

  const result = parseTraderChukoDetail(html, detailUrl, null);

  it('extracts price from #taxPrice', () => expect(result?.price).toBe(9380));
  it('sets availability to in_stock', () => expect(result?.availability).toBe('in_stock'));
});

describe('parseTraderChukoDetail — in_stock via hidden price inputs', () => {
  const detailUrl = `${DETAIL_BASE}detail.html?id=100003`;
  const html = `<!DOCTYPE html><html><body>
    <h1>架空ゲーム 通常版</h1>
    <input type="hidden" name="price1" value="5980">
  </body></html>`;

  const result = parseTraderChukoDetail(html, detailUrl, null);

  it('extracts price from input[name=price1]', () => expect(result?.price).toBe(5980));
  it('sets availability to in_stock', () => expect(result?.availability).toBe('in_stock'));
});

describe('parseTraderChukoDetail — sold-out via actual .soldout element', () => {
  const detailUrl = `${DETAIL_BASE}detail.html?id=100004`;
  const html = `<!DOCTYPE html><html><body>
    <h1>架空ゲーム 初回版</h1>
    <p class="soldout">売り切れ</p>
  </body></html>`;

  const result = parseTraderChukoDetail(html, detailUrl, null);

  it('sets availability to out_of_stock', () => expect(result?.availability).toBe('out_of_stock'));
  it('sets price to null when sold out', () => expect(result?.price).toBeNull());
  it('sets availability_label to 売り切れ', () => expect(result?.availability_label).toBe('売り切れ'));
});

describe('parseTraderChukoDetail — no false sold-out from script/template text', () => {
  const detailUrl = `${DETAIL_BASE}detail.html?id=100005`;
  const html = `<!DOCTYPE html><html><head>
    <meta property="product:price:amount" content="3800">
    <script>
      var soldOutMessage = "売り切れ";
      var template = '<p class="soldout">売り切れ</p>';
    </script>
    <style>.soldout { color: red; } /* 売り切れ style */</style>
  </head><body>
    <h1>架空ゲーム3</h1>
    <p class="price"><em>3,800</em>円(税込)</p>
  </body></html>`;

  const result = parseTraderChukoDetail(html, detailUrl, null);

  it('returns in_stock despite 売り切れ in script/style', () => {
    expect(result?.availability).toBe('in_stock');
  });

  it('extracts price correctly', () => expect(result?.price).toBe(3800));
});

describe('parseTraderChukoDetail — policy note, no branch confirmation', () => {
  const detailUrl = `${DETAIL_BASE}detail.html?id=100006`;
  const html = `<!DOCTYPE html><html><body>
    <h1>架空ゲーム 豪華版</h1>
    <p class="price"><em>12,800</em>円(税込)</p>
    <p>商品名に【店頭併売】記載のある商品は実店舗と在庫を共有しているため、お品物がご用意できない場合がございます。</p>
    <p>こちらは当通販サイトでの販売価格です、トレーダー店舗とは価格が異なりますので、店舗価格は各店舗にお電話にてお問い合わせください。</p>
  </body></html>`;

  const result = parseTraderChukoDetail(html, detailUrl, null);

  it('returns a non-null offer', () => expect(result).not.toBeNull());
  it('location_branch remains null — policy note is not branch evidence', () => {
    expect(result?.location_branch).toBeNull();
  });
  it('availability is in_stock because price exists and no soldout element', () => {
    expect(result?.availability).toBe('in_stock');
  });
});

describe('parseTraderChukoDetail — 【店頭併売】 in product title triggers shared-store hint', () => {
  const detailUrl = `${DETAIL_BASE}detail.html?id=100007`;
  const html = `<!DOCTYPE html><html><body>
    <h1>【店頭併売】架空ゲーム 初回版</h1>
    <p class="price"><em>5,480</em>円(税込)</p>
  </body></html>`;

  const result = parseTraderChukoDetail(html, detailUrl, null);

  it('sets availability_label to shared-store hint', () => {
    expect(result?.availability_label).toBe('販売中（店頭在庫共有の可能性あり）');
  });

  it('still sets availability to in_stock', () => {
    expect(result?.availability).toBe('in_stock');
  });

  it('location_branch remains null — hint is not confirmed branch stock', () => {
    expect(result?.location_branch).toBeNull();
  });
});

describe('parseTraderChukoDetail — title without 【店頭併売】 has no shared-store hint', () => {
  const detailUrl = `${DETAIL_BASE}detail.html?id=100008`;
  const html = `<!DOCTYPE html><html><body>
    <h1>架空ゲーム 通常版</h1>
    <p class="price"><em>4,200</em>円(税込)</p>
    <p>商品名に【店頭併売】記載のある商品は実店舗と在庫を共有しているため、お品物がご用意できない場合がございます。</p>
  </body></html>`;

  const result = parseTraderChukoDetail(html, detailUrl, null);

  it('availability_label is 販売中 without the hint', () => {
    expect(result?.availability_label).toBe('販売中');
  });
});

describe('parseTraderChukoDetail — location_branch is never an online shop name', () => {
  const detailUrl = `${DETAIL_BASE}detail.html?id=100009`;
  const html = `<!DOCTYPE html><html><body>
    <h1>架空ゲーム2 限定版</h1>
    <p class="price"><em>9,800</em>円(税込)</p>
    <p>秋葉原トレーダー通販でのご注文を承ります。</p>
    <p>トレーダー通販限定セット</p>
  </body></html>`;

  const result = parseTraderChukoDetail(html, detailUrl, null);

  it('location_branch is null — 秋葉原トレーダー通販 is an online shop name, not a branch', () => {
    expect(result?.location_branch).toBeNull();
  });

  it('location_label contains online shop name', () => {
    expect(result?.location_label).toBe('Trader Online / 秋葉原トレーダー通販');
  });
});

describe('parseTraderChukoDetail — fallback offer used when no title in HTML', () => {
  const detailUrl = `${DETAIL_BASE}detail.html?id=100010`;
  const html = `<!DOCTYPE html><html><body>
    <p class="price"><em>2,500</em>円(税込)</p>
  </body></html>`;

  const fallback = {
    provider_offer_id: '100010',
    title: '架空ゲーム (フォールバック)',
    url: detailUrl,
    price: 2500,
    availability: 'in_stock' as const,
    availability_label: null,
    condition: 'Used',
    edition_label: null,
    location_label: 'Trader Online / 秋葉原トレーダー通販',
    location_branch: null,
    source_release_id: null,
    jan: null,
  };

  const result = parseTraderChukoDetail(html, detailUrl, fallback);

  it('uses fallback title when HTML has no title element', () => {
    expect(result?.title).toBe('架空ゲーム (フォールバック)');
  });

  it('extracts price from HTML despite missing title', () => {
    expect(result?.price).toBe(2500);
  });
});
