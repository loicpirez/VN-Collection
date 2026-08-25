// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readApiError } from '@/lib/api-error-read';

afterEach(() => {
  document.documentElement.lang = '';
});

describe('legacy API error locale boundary', () => {
  it('keeps a safe server detail in English documents', async () => {
    document.documentElement.lang = 'en-US';
    const response = new Response(JSON.stringify({ error: 'invalid id' }), { status: 400 });
    expect(await readApiError(response, 'Request failed')).toBe('invalid id');
  });

  it('uses the caller-localized fallback in French and Japanese documents', async () => {
    document.documentElement.lang = 'fr';
    const frenchResponse = new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    expect(await readApiError(frenchResponse, 'Element introuvable')).toBe('Element introuvable');

    document.documentElement.lang = 'ja';
    const japaneseResponse = new Response(JSON.stringify({
      ok: false,
      error: 'upstream service unavailable',
      code: 'upstream_unavailable',
      context: 'search',
    }), { status: 502 });
    expect(await readApiError(japaneseResponse, 'サービスを利用できません')).toBe('サービスを利用できません');
  });

  it('treats an unspecified document language as the backwards-compatible English mode', async () => {
    const response = new Response(JSON.stringify({ error: 'specific detail' }), { status: 409 });
    expect(await readApiError(response, 'Conflict')).toBe('specific detail');
  });
});
