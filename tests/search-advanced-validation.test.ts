import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  advancedSearchVn: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  advancedSearchVn: mocks.advancedSearchVn,
}));

vi.mock('@/lib/db', () => ({
  isInCollectionMany: () => new Set<string>(),
}));

import { POST } from '@/app/api/search/advanced/route';

function request(body: unknown): NextRequest {
  return new NextRequest('http://127.0.0.1/api/search/advanced', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: string): NextRequest {
  return new NextRequest('http://127.0.0.1/api/search/advanced', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('POST /api/search/advanced validation', () => {
  beforeEach(() => {
    mocks.advancedSearchVn.mockReset();
    mocks.advancedSearchVn.mockResolvedValue({ results: [], more: false });
  });

  it('rejects unbounded language arrays', async () => {
    const response = await POST(request({
      langs: Array.from({ length: 33 }, (_, index) => `l${index}`),
    }));
    expect(response.status).toBe(400);
    expect(mocks.advancedSearchVn).not.toHaveBeenCalled();
  });

  it('rejects non-object JSON bodies', async () => {
    for (const body of [null, ['ja']]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'body must be a JSON object' });
    }
    expect(mocks.advancedSearchVn).not.toHaveBeenCalled();
  });

  it('rejects fractional integer controls', async () => {
    for (const field of ['lengthMin', 'lengthMax', 'yearMin', 'yearMax', 'results', 'page']) {
      const response = await POST(request({ [field]: 2.5 }));
      expect(response.status, field).toBe(400);
    }
    expect(mocks.advancedSearchVn).not.toHaveBeenCalled();
  });

  it('rejects invalid scalar fields', async () => {
    for (const body of [
      { q: 'a'.repeat(201) },
      { hasScreenshot: 'yes' },
      { sort: 'bad-sort' },
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(mocks.advancedSearchVn).not.toHaveBeenCalled();
  });

  it('deduplicates bounded filters and preserves fractional ratings', async () => {
    const response = await POST(request({
      langs: ['ja', 'ja'],
      platforms: ['win', 'win'],
      ratingMin: 73.5,
    }));
    expect(response.status).toBe(200);
    expect(mocks.advancedSearchVn).toHaveBeenCalledWith({
      langs: ['ja'],
      platforms: ['win'],
      ratingMin: 73.5,
    });
  });

  it('rejects streamed JSON payloads above the route cap', async () => {
    const response = await POST(request({ q: 'a'.repeat(70_000) }));
    expect(response.status).toBe(413);
    expect(mocks.advancedSearchVn).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON payloads', async () => {
    const response = await POST(rawRequest('{'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid JSON' });
    expect(mocks.advancedSearchVn).not.toHaveBeenCalled();
  });

  it('returns a sanitized upstream error when VNDB advanced search fails', async () => {
    mocks.advancedSearchVn.mockRejectedValueOnce(new Error('remote down'));

    const response = await POST(request({ q: 'valid' }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'upstream service unavailable' });
  });
});
