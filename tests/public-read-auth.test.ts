import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  publicReadAuthMode,
  publicReadsAreProtected,
  requireOptionalPublicReadAuth,
} from '@/lib/api-route-meta';
import { proxy } from '@/proxy';
import { GET as providerMapGET } from '@/app/api/places/provider-map/route';
import { GET as unassignedGET } from '@/app/api/places/unassigned/route';

const saved = {
  mode: process.env.VN_PUBLIC_READ_AUTH,
  token: process.env.VN_ADMIN_TOKEN,
};

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(`https://collection.example.test${path}`, init);
}

beforeEach(() => {
  delete process.env.VN_PUBLIC_READ_AUTH;
  delete process.env.VN_ADMIN_TOKEN;
});

afterEach(() => {
  if (saved.mode === undefined) delete process.env.VN_PUBLIC_READ_AUTH;
  else process.env.VN_PUBLIC_READ_AUTH = saved.mode;
  if (saved.token === undefined) delete process.env.VN_ADMIN_TOKEN;
  else process.env.VN_ADMIN_TOKEN = saved.token;
});

describe('optional public read authentication', () => {
  it('normalizes supported modes and falls back to open', () => {
    expect(publicReadAuthMode()).toBe('open');
    expect(publicReadAuthMode(' TOKEN ')).toBe('token');
    expect(publicReadAuthMode('UPSTREAM')).toBe('upstream');
    expect(publicReadAuthMode('invalid')).toBe('open');
    expect(publicReadsAreProtected('token')).toBe(true);
    expect(publicReadsAreProtected('upstream')).toBe(true);
    expect(publicReadsAreProtected('open')).toBe(false);
    process.env.VN_PUBLIC_READ_AUTH = 'token';
    expect(publicReadsAreProtected()).toBe(true);
  });

  it('allows open and upstream reads without app credentials', () => {
    expect(requireOptionalPublicReadAuth(request('/api/collection'))).toBeNull();
    process.env.VN_PUBLIC_READ_AUTH = 'upstream';
    expect(requireOptionalPublicReadAuth(request('/api/collection'))).toBeNull();
  });

  it('requires the configured token for remote reads but preserves loopback access', async () => {
    process.env.VN_PUBLIC_READ_AUTH = 'token';
    process.env.VN_ADMIN_TOKEN = 'read-test-secret';
    const denied = requireOptionalPublicReadAuth(request('/api/collection'));
    expect(denied?.status).toBe(403);
    expect(await denied?.json()).toEqual({
      error: 'Forbidden — this endpoint is restricted to localhost. Set VN_ADMIN_TOKEN to allow remote access from a known client.',
    });
    expect(requireOptionalPublicReadAuth(new NextRequest('http://127.0.0.1/api/collection'))).toBeNull();
    expect(requireOptionalPublicReadAuth(request('/api/collection', {
      headers: { authorization: 'Bearer read-test-secret' },
    }))).toBeNull();
  });

  it('requires the token for mutations at the global proxy boundary', () => {
    process.env.VN_PUBLIC_READ_AUTH = 'token';
    process.env.VN_ADMIN_TOKEN = 'read-test-secret';
    expect(requireOptionalPublicReadAuth(request('/api/collection', { method: 'POST' }))?.status).toBe(403);
    expect(requireOptionalPublicReadAuth(request('/api/collection', {
      method: 'POST',
      headers: { authorization: 'Bearer read-test-secret' },
    }))).toBeNull();
  });

  it('keeps the health endpoint available to deployment probes', () => {
    process.env.VN_PUBLIC_READ_AUTH = 'token';
    expect(requireOptionalPublicReadAuth(request('/api/health?check=live'))).toBeNull();
  });

  it('enforces token mode globally in the API proxy', async () => {
    process.env.VN_PUBLIC_READ_AUTH = 'token';
    process.env.VN_ADMIN_TOKEN = 'read-test-secret';
    const denied = proxy(request('/api/collection'));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({
      error: 'Forbidden — this endpoint is restricted to localhost. Set VN_ADMIN_TOKEN to allow remote access from a known client.',
    });
    const allowed = proxy(request('/api/collection', {
      headers: { 'x-admin-token': 'read-test-secret' },
    }));
    expect(allowed.headers.get('x-middleware-next')).toBe('1');
  });

  it('challenges HTML, RSC, and static requests while keeping health open', async () => {
    process.env.VN_PUBLIC_READ_AUTH = 'token';
    process.env.VN_ADMIN_TOKEN = 'read-test-secret';
    for (const candidate of [
      request('/'),
      request('/vn/v90001', { headers: { rsc: '1' } }),
      request('/_next/static/chunks/app.js'),
    ]) {
      const denied = proxy(candidate);
      expect(denied.status).toBe(401);
      expect(await denied.text()).toBe('');
      expect(denied.headers.get('www-authenticate')).toBe('Basic realm="VN Collection", charset="UTF-8"');
      expect(denied.headers.get('cache-control')).toBe('no-store');
    }
    const health = proxy(request('/api/health?check=ready'));
    expect(health.status).toBe(200);
    expect(health.headers.get('x-middleware-next')).toBe('1');
  });

  it('uses one HTTP Basic credential for HTML, RSC, static, and API requests', () => {
    process.env.VN_PUBLIC_READ_AUTH = 'token';
    process.env.VN_ADMIN_TOKEN = 'read-test-secret';
    const authorization = `Basic ${Buffer.from('vndb:read-test-secret').toString('base64')}`;
    for (const path of ['/', '/vn/v90001', '/_next/static/chunks/app.js', '/api/collection']) {
      const allowed = proxy(request(path, { headers: { authorization } }));
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get('x-middleware-next')).toBe('1');
    }
    expect(proxy(request('/', {
      headers: { authorization: `Basic ${Buffer.from('other:read-test-secret').toString('base64')}` },
    })).status).toBe(401);
    expect(proxy(request('/', {
      headers: { authorization: `Basic ${Buffer.from('vndb:wrong').toString('base64')}` },
    })).status).toBe(401);
    expect(proxy(request('/', { headers: { authorization: 'Basic a' } })).status).toBe(401);
    expect(proxy(request('/', {
      headers: { authorization: `Basic ${Buffer.from('vndb').toString('base64')}` },
    })).status).toBe(401);
  });

  it('preserves direct localhost page access in token mode', () => {
    process.env.VN_PUBLIC_READ_AUTH = 'token';
    process.env.VN_ADMIN_TOKEN = 'read-test-secret';
    for (const path of ['/', '/_next/static/chunks/app.js', '/api/collection']) {
      const allowed = proxy(new NextRequest(`http://127.0.0.1:3000${path}`));
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get('x-middleware-next')).toBe('1');
    }
  });

  it('leaves HTML and RSC authentication to the reverse proxy in upstream mode', () => {
    process.env.VN_PUBLIC_READ_AUTH = 'upstream';
    const page = proxy(request('/'));
    const rsc = proxy(request('/vn/v90001', { headers: { rsc: '1' } }));
    expect(page.status).toBe(200);
    expect(page.headers.get('x-middleware-next')).toBe('1');
    expect(rsc.status).toBe(200);
    expect(rsc.headers.get('x-middleware-next')).toBe('1');
  });

  it('protects provider-map and unassigned route handlers in token mode', async () => {
    process.env.VN_PUBLIC_READ_AUTH = 'token';
    process.env.VN_ADMIN_TOKEN = 'read-test-secret';
    const providerResponse = await providerMapGET(request('/api/places/provider-map'));
    expect(providerResponse.status).toBe(403);
    expect(await providerResponse.json()).toHaveProperty('error');
    const unassignedResponse = await unassignedGET(request('/api/places/unassigned'));
    expect(unassignedResponse.status).toBe(403);
    expect(await unassignedResponse.json()).toHaveProperty('error');
  });
});
