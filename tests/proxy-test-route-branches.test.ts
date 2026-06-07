import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { providerFetchMock, stockProviderFetchMock } = vi.hoisted(() => ({
  providerFetchMock: vi.fn(),
  stockProviderFetchMock: vi.fn(),
}));

vi.mock('@/lib/proxy-fetch', () => ({
  providerFetch: providerFetchMock,
  stockProviderFetch: stockProviderFetchMock,
}));

import { POST } from '@/app/api/proxy/test/route';
import { setAppSetting } from '@/lib/db';

function request(body: unknown, host = '127.0.0.1'): NextRequest {
  return new NextRequest(`http://${host}/api/proxy/test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  providerFetchMock.mockReset();
  stockProviderFetchMock.mockReset();
  setAppSetting('vndb_proxy_config', null);
  setAppSetting('sofmap_proxy_config', null);
  setAppSetting('stock_proxy_config', null);
});

describe('POST /api/proxy/test probe branches', () => {
  it('runs a fixed-provider probe and reports the upstream status', async () => {
    setAppSetting('vndb_proxy_config', JSON.stringify({
      enabled: true,
      protocol: 'http',
      host: 'proxy.example.test',
      port: 8080,
    }));
    providerFetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await POST(request({ provider: 'vndb' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: 204 });
    expect(providerFetchMock).toHaveBeenCalledWith(
      'https://api.vndb.org/kana/schema',
      expect.objectContaining({
        method: 'GET',
        headers: { 'User-Agent': 'vndb-collection/1.0 (proxy test)' },
      }),
      'vndb',
    );
  });

  it('reports a remote 5xx as a non-fatal failed probe', async () => {
    setAppSetting('vndb_proxy_config', JSON.stringify({
      enabled: true,
      protocol: 'http',
      host: 'proxy.example.test',
      port: 8080,
    }));
    providerFetchMock.mockResolvedValue(new Response(null, { status: 503 }));

    const response = await POST(request({ provider: 'vndb' }, '127.0.0.2'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: false, error: 'remote returned HTTP 503' });
  });

  it('sanitizes thrown proxy errors', async () => {
    setAppSetting('vndb_proxy_config', JSON.stringify({
      enabled: true,
      protocol: 'http',
      host: 'proxy.example.test',
      port: 8080,
    }));
    providerFetchMock.mockRejectedValue(new Error('failed via http://user:secret@proxy.example.test:8080'));

    const response = await POST(request({ provider: 'vndb' }, '127.0.0.3'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).not.toContain('secret');
  });

  it('aborts slow proxy probes after the timeout window', async () => {
    vi.useFakeTimers();
    try {
      setAppSetting('vndb_proxy_config', JSON.stringify({
        enabled: true,
        protocol: 'http',
        host: 'proxy.example.test',
        port: 8080,
      }));
      providerFetchMock.mockImplementation((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal;
          if (!(signal instanceof AbortSignal)) throw new Error('missing abort signal');
          signal.addEventListener('abort', () => reject(new Error('probe aborted')));
        }),
      );

      const pending = POST(request({ provider: 'vndb' }, '127.0.0.33'));
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await pending;

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: false, error: 'probe aborted' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs a per-shop stock-provider probe through the shop override', async () => {
    setAppSetting('sofmap_proxy_config', JSON.stringify({
      enabled: true,
      protocol: 'socks5h',
      host: 'shop-proxy.example.test',
      port: 1080,
    }));
    stockProviderFetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const response = await POST(request({ provider: 'sofmap' }, '127.0.0.4'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: 200 });
    expect(stockProviderFetchMock).toHaveBeenCalledWith(
      'https://www.sofmap.com/',
      expect.objectContaining({ method: 'GET' }),
      'sofmap',
    );
  });

  it('returns not-configured for a stock provider without fixed or generic proxy config', async () => {
    const response = await POST(request({ provider: 'sofmap' }, '127.0.0.5'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'proxy is not configured or disabled for this provider' });
    expect(stockProviderFetchMock).not.toHaveBeenCalled();
  });

  it('runs AliceNet through the stock provider proxy instead of fixed-provider config', async () => {
    setAppSetting('stock_proxy_config', JSON.stringify({
      enabled: true,
      protocol: 'socks5h',
      host: 'stock-proxy.example.test',
      port: 1080,
    }));
    stockProviderFetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const response = await POST(request({ provider: 'alicenet' }, '127.0.0.6'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: 200 });
    expect(providerFetchMock).not.toHaveBeenCalled();
    expect(stockProviderFetchMock).toHaveBeenCalledWith(
      'https://www.alice-kobe.com/html/page4.html',
      expect.objectContaining({ method: 'GET' }),
      'alicenet',
    );
  });

  it('rate-limits repeated probe attempts before parsing provider details', async () => {
    let limited: Response | null = null;
    for (let i = 0; i < 31; i += 1) {
      limited = await POST(request({ provider: '__not_a_provider__' }, '127.0.0.240'));
    }

    if (!limited) throw new Error('rate-limit probe did not run');
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate limit exceeded' });
    expect(limited.headers.get('Retry-After')).toBe('10');
  });
});
