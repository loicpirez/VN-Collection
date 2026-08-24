import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

function mutationRequest(
  path: string,
  contentType: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`https://collection.example${path}`, {
    method: 'POST',
    headers: {
      'content-type': contentType,
      ...headers,
    },
  });
}

describe('root API proxy CSRF integration', () => {
  it('allows JSON mutations from programmatic same-host clients', () => {
    const response = proxy(mutationRequest('/api/collection/v90001', 'application/json'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('rejects simple form mutations even when the browser reports same-origin', async () => {
    const response = proxy(mutationRequest(
      '/api/collection/v90001',
      'application/x-www-form-urlencoded',
      { 'sec-fetch-site': 'same-origin' },
    ));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: 'unsupported content-type for state-mutating request' });
  });

  it('allows same-origin multipart cover uploads', () => {
    const response = proxy(mutationRequest(
      '/api/collection/v90001/cover',
      'multipart/form-data; boundary=secure-boundary',
      { 'sec-fetch-site': 'same-origin', origin: 'https://collection.example' },
    ));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('rejects cross-site multipart banner uploads', async () => {
    const response = proxy(mutationRequest(
      '/api/collection/v90001/banner',
      'multipart/form-data; boundary=hostile-boundary',
      { 'sec-fetch-site': 'cross-site', origin: 'https://attacker.example' },
    ));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'cross-site request denied' });
  });
});
