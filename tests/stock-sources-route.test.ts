import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/vn/[id]/stock/sources/route';
import { deleteStockSource, listStockSources, upsertStockSource } from '@/lib/db';

const VN_ID = 'v97531';

function clear() {
  for (const s of listStockSources(VN_ID)) deleteStockSource(VN_ID, s.id);
}

function makeReq(body: unknown) {
  return new Request('http://localhost/api/vn/v97531/stock/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', host: '127.0.0.1' },
    body: JSON.stringify(body),
  });
}

beforeEach(clear);
afterEach(clear);

describe('POST /api/vn/[id]/stock/sources — validation', () => {
  it('rejects non-local requests before parsing source URLs', async () => {
    const res = await POST(
      new Request('http://example.com/api/vn/v97531/stock/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.amazon.co.jp/dp/B000JF6UD2' }),
      }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(403);
  });

  it('rejects invalid VN ids before parsing the source URL', async () => {
    const res = await POST(
      makeReq({ url: 'https://www.amazon.co.jp/dp/B000JF6UD2' }) as never,
      { params: Promise.resolve({ id: 'bad' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid id/);
  });

  it('rejects missing url with 400', async () => {
    const res = await POST(makeReq({}) as never, { params: Promise.resolve({ id: VN_ID }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/url required/);
  });

  it('rejects garbage url with 400 (invalid url)', async () => {
    const res = await POST(
      makeReq({ url: 'not a url' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid url/);
  });

  it('rejects file:// scheme', async () => {
    const res = await POST(
      makeReq({ url: 'file:///etc/passwd' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unsupported url/);
  });

  it('rejects unsupported domain with 400 (not in provider list)', async () => {
    const res = await POST(
      makeReq({ url: 'https://example.com/page' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unsupported provider/);
  });

  it('rejects allowed non-shop hosts that are not stock providers', async () => {
    const res = await POST(
      makeReq({ url: 'https://t.vndb.org/cv/00/1.jpg' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unsupported provider/);
  });

  it('rejects extremely long url', async () => {
    const url = 'https://www.amazon.co.jp/dp/' + 'A'.repeat(2000);
    const res = await POST(
      makeReq({ url }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/url too long/);
  });

  it('accepts a valid Amazon DP url and canonicalises it', async () => {
    const res = await POST(
      makeReq({ url: 'https://www.amazon.co.jp/dp/B000JF6UD2/ref=tracking?tag=foo' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(200);
    const sources = listStockSources(VN_ID);
    expect(sources).toHaveLength(1);
    expect(sources[0].provider).toBe('amazon_jp');
    expect(sources[0].url).toBe('https://www.amazon.co.jp/dp/B000JF6UD2');
    expect(sources[0].product_id).toBe('B000JF6UD2');
  });

  it('accepts a valid Sofmap URL without product-id canonicalization', async () => {
    const url = 'https://a.sofmap.com/product_detail.aspx?sku=100959203';
    const res = await POST(
      makeReq({ url }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(200);
    const sources = listStockSources(VN_ID);
    expect(sources).toHaveLength(1);
    expect(sources[0].provider).toBe('sofmap');
    expect(sources[0].url).toBe(url);
    expect(sources[0].product_id).toBeNull();
  });

  it('rejects more than 32 manual sources per VN', async () => {
    for (let i = 0; i < 32; i++) {
      upsertStockSource({
        vn_id: VN_ID,
        provider: 'amazon_jp',
        url: `https://www.amazon.co.jp/dp/B${String(i).padStart(9, '0')}`,
        product_id: `B${String(i).padStart(9, '0')}`,
      });
    }
    const res = await POST(
      makeReq({ url: 'https://www.amazon.co.jp/dp/B999999999' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too many manual sources/);
  });

  it('allows updating an existing source at the cap', async () => {
    for (let i = 0; i < 32; i++) {
      upsertStockSource({
        vn_id: VN_ID,
        provider: 'amazon_jp',
        url: `https://www.amazon.co.jp/dp/B${String(i).padStart(9, '0')}`,
        product_id: `B${String(i).padStart(9, '0')}`,
      });
    }
    // Same URL — should succeed because it's an update of an existing tuple.
    const res = await POST(
      makeReq({ url: 'https://www.amazon.co.jp/dp/B000000005' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(200);
    expect(listStockSources(VN_ID)).toHaveLength(32);
  });

  it('rejects release_id values that do not look like r\\d+', async () => {
    const res = await POST(
      makeReq({ url: 'https://www.amazon.co.jp/dp/B000JF6UD2', release_id: 'not-a-release' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(400);
    expect(listStockSources(VN_ID)).toHaveLength(0);
  });

  it('stores a valid release_id with the manual source', async () => {
    const res = await POST(
      makeReq({ url: 'https://www.amazon.co.jp/dp/B000JF6UD2', release_id: 'R12345' }) as never,
      { params: Promise.resolve({ id: VN_ID }) },
    );
    expect(res.status).toBe(200);
    const sources = listStockSources(VN_ID);
    expect(sources).toHaveLength(1);
    expect(sources[0].release_id).toBe('R12345');
  });
});
