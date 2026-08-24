/**
 * Unit tests for src/lib/proxy-config.ts
 *
 * Covers:
 *   - resolveProxyConfig: disabled / missing fields / valid env config
 *   - buildProxyUrl: credential encoding
 *   - saveProxyConfig: validation rules, password sentinel preservation
 *   - getProxyConfigForDisplay: masking logic
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => {
  let store: Record<string, string | null> = {};
  return {
    getAppSetting: (key: string) => store[key] ?? null,
    setAppSetting: (key: string, value: string | null) => {
      if (value == null) delete store[key];
      else store[key] = value;
    },
    __reset: () => { store = {}; },
  };
});

import {
  buildProxyUrl,
  getProxyConfigForDisplay,
  getStockProviderProxyDisplay,
  isStockProviderProxied,
  PROXY_PASSWORD_MASK,
  resolveProxyConfig,
  resolveStockProviderProxy,
  saveProxyConfig,
  saveStockProviderProxyConfig,
} from '@/lib/proxy-config';

const dbMock = await import('@/lib/db') as typeof import('@/lib/db') & { __reset: () => void };

function resetStore() {
  dbMock.__reset();
}

beforeEach(() => {
  resetStore();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveProxyConfig', () => {
  it('returns null when not enabled', async () => {
    expect(await resolveProxyConfig('egs')).toBeNull();
  });

  it('returns null when env enabled but host missing', async () => {
    vi.stubEnv('EGS_PROXY_ENABLED', 'true');
    expect(await resolveProxyConfig('egs')).toBeNull();
  });

  it('returns null when env enabled and host present but port missing', async () => {
    vi.stubEnv('EGS_PROXY_ENABLED', 'true');
    vi.stubEnv('EGS_PROXY_HOST', 'proxy.example.com');
    expect(await resolveProxyConfig('egs')).toBeNull();
  });

  it('returns null when env enabled but port invalid', async () => {
    vi.stubEnv('EGS_PROXY_ENABLED', 'true');
    vi.stubEnv('EGS_PROXY_HOST', 'proxy.example.com');
    vi.stubEnv('EGS_PROXY_PORT', 'notanumber');
    expect(await resolveProxyConfig('egs')).toBeNull();
  });

  it('rejects partial numeric ports instead of accepting a parseInt prefix', async () => {
    vi.stubEnv('EGS_PROXY_ENABLED', 'true');
    vi.stubEnv('EGS_PROXY_HOST', 'proxy.example.com');
    vi.stubEnv('EGS_PROXY_PORT', '1080junk');
    expect(await resolveProxyConfig('egs')).toBeNull();
  });

  it('returns null when env port is outside the valid range or protocol is invalid', async () => {
    vi.stubEnv('EGS_PROXY_ENABLED', 'true');
    vi.stubEnv('EGS_PROXY_HOST', 'proxy.example.com');
    vi.stubEnv('EGS_PROXY_PORT', '0');
    expect(await resolveProxyConfig('egs')).toBeNull();
    vi.stubEnv('EGS_PROXY_PORT', '65536');
    expect(await resolveProxyConfig('egs')).toBeNull();
    vi.stubEnv('EGS_PROXY_PORT', '1080');
    vi.stubEnv('EGS_PROXY_PROTOCOL', 'ftp');
    expect(await resolveProxyConfig('egs')).toBeNull();
  });

  it('returns config from env vars', async () => {
    vi.stubEnv('EGS_PROXY_ENABLED', '1');
    vi.stubEnv('EGS_PROXY_HOST', 'nl.socks.nordhold.net');
    vi.stubEnv('EGS_PROXY_PORT', '1080');
    vi.stubEnv('EGS_PROXY_PROTOCOL', 'socks5h');
    vi.stubEnv('EGS_PROXY_USERNAME', 'user');
    vi.stubEnv('EGS_PROXY_PASSWORD', 'secret');
    const cfg = await resolveProxyConfig('egs');
    expect(cfg).toMatchObject({
      protocol: 'socks5h',
      host: 'nl.socks.nordhold.net',
      port: 1080,
      username: 'user',
      password: 'secret',
    });
  });

  it('defaults protocol to socks5h when not specified', async () => {
    vi.stubEnv('EGS_PROXY_ENABLED', 'true');
    vi.stubEnv('EGS_PROXY_HOST', 'proxy.example.com');
    vi.stubEnv('EGS_PROXY_PORT', '1080');
    const cfg = await resolveProxyConfig('egs');
    expect(cfg?.protocol).toBe('socks5h');
  });

  it('reads from DB when env vars absent', async () => {
    const err = await saveProxyConfig('vndb', {
      enabled: true,
      protocol: 'http',
      host: 'proxy.example.com',
      port: 8080,
    });
    expect(err).toBeNull();
    const cfg = await resolveProxyConfig('vndb');
    expect(cfg).toMatchObject({ protocol: 'http', host: 'proxy.example.com', port: 8080 });
  });

  it('env ENABLED=false overrides DB enabled=true', async () => {
    await saveProxyConfig('egs', { enabled: true, host: 'proxy.example.com', port: 1080 });
    vi.stubEnv('EGS_PROXY_ENABLED', 'false');
    expect(await resolveProxyConfig('egs')).toBeNull();
  });

  it('drops malformed stored fields instead of coercing them', async () => {
    dbMock.setAppSetting('egs_proxy_config', JSON.stringify({
      enabled: 'true',
      host: ['proxy.example.com'],
      port: '1080',
      username: 42,
      password: false,
    }));
    expect(await resolveProxyConfig('egs')).toBeNull();
    expect(await getProxyConfigForDisplay('egs')).toMatchObject({
      enabled: false,
      host: '',
      port: null,
      username: '',
      hasPassword: false,
    });
  });

  it('drops malformed stored envelopes and reads all persisted scalar fields', async () => {
    for (const raw of ['not-json', 'null', '1', '[]']) {
      dbMock.setAppSetting('egs_proxy_config', raw);
      expect(await getProxyConfigForDisplay('egs')).toMatchObject({
        enabled: false,
        host: '',
        port: null,
        username: '',
        hasPassword: false,
      });
    }
    dbMock.setAppSetting('egs_proxy_config', JSON.stringify({
      enabled: true,
      protocol: 'https',
      host: 'persisted.example.com',
      port: 8443,
      username: 'persisted-user',
      password: 'persisted-password',
    }));
    expect(await resolveProxyConfig('egs')).toEqual({
      protocol: 'https',
      host: 'persisted.example.com',
      port: 8443,
      username: 'persisted-user',
      password: 'persisted-password',
    });
    expect((await getProxyConfigForDisplay('egs')).protocol).toBe('https');
  });

  it('normalizes empty stored credentials to null in an active resolved config', async () => {
    dbMock.setAppSetting('egs_proxy_config', JSON.stringify({
      enabled: true,
      host: 'persisted.example.com',
      port: 1080,
      username: '',
      password: '',
    }));
    expect(await resolveProxyConfig('egs')).toMatchObject({ username: null, password: null });
  });

  it('does not resolve AliceNet as a fixed proxy provider', async () => {
    expect(await resolveProxyConfig('alicenet')).toBeNull();
    dbMock.setAppSetting('alicenet_proxy_config', JSON.stringify({
      enabled: true,
      protocol: 'socks5h',
      host: 'stored-alicenet.example.com',
      port: 1081,
    }));
    expect(await resolveProxyConfig('alicenet')).toBeNull();
    expect(await getProxyConfigForDisplay('alicenet')).toMatchObject({ enabled: false, host: '', port: null });
    expect(await saveProxyConfig('alicenet', { enabled: true })).toContain('stock_proxy_config');
  });
});

describe('buildProxyUrl', () => {
  it('builds bare URL without credentials', async () => {
    expect(
      buildProxyUrl({ protocol: 'socks5h', host: 'example.com', port: 1080, username: null, password: null }),
    ).toBe('socks5h://example.com:1080');
  });

  it('encodes credentials', async () => {
    expect(
      buildProxyUrl({ protocol: 'http', host: 'proxy.example.com', port: 8080, username: 'u@ser', password: 'p@ss' }),
    ).toBe('http://u%40ser:p%40ss@proxy.example.com:8080');
  });

  it('omits password when null', async () => {
    expect(
      buildProxyUrl({ protocol: 'http', host: 'h', port: 80, username: 'user', password: null }),
    ).toBe('http://user@h:80');
  });
});

describe('saveProxyConfig', () => {
  it('rejects invalid enabled and protocol types', async () => {
    expect(await saveProxyConfig('egs', { enabled: 'true' })).toMatch(/enabled/);
    expect(await saveProxyConfig('egs', { protocol: 1 })).toMatch(/protocol/);
  });

  it('rejects invalid protocol', async () => {
    expect(await saveProxyConfig('egs', { protocol: 'ftp' })).toMatch(/protocol/);
  });

  it('rejects port out of range', async () => {
    expect(await saveProxyConfig('egs', { port: 99999 })).toMatch(/port/);
    expect(await saveProxyConfig('egs', { port: 1.5 })).toMatch(/port/);
  });

  it('accepts string ports and clears empty ports', async () => {
    expect(await saveProxyConfig('egs', { port: '1080' })).toBeNull();
    expect((await getProxyConfigForDisplay('egs')).port).toBe(1080);
    expect(await saveProxyConfig('egs', { port: '' })).toBeNull();
    expect((await getProxyConfigForDisplay('egs')).port).toBeNull();
    expect(await saveProxyConfig('egs', { port: null })).toBeNull();
  });

  it('rejects private host', async () => {
    expect(await saveProxyConfig('egs', { host: '192.168.1.1' })).toMatch(/private/);
  });

  it('rejects localhost', async () => {
    expect(await saveProxyConfig('egs', { host: 'localhost' })).toMatch(/private/);
  });

  it('rejects malformed and oversized hosts and clears a null host', async () => {
    expect(await saveProxyConfig('egs', { host: 1 })).toMatch(/host/);
    expect(await saveProxyConfig('egs', { host: 'a'.repeat(256) })).toMatch(/long/);
    expect(await saveProxyConfig('egs', { host: '-bad.example.com' })).toMatch(/hostname/);
    expect(await saveProxyConfig('egs', { host: '10.0.0.1' })).toMatch(/private/);
    expect(await saveProxyConfig('egs', { host: '172.16.0.1' })).toMatch(/private/);
    expect(await saveProxyConfig('egs', { host: null })).toBeNull();
    expect((await getProxyConfigForDisplay('egs')).host).toBe('');
  });

  it('validates, trims, and clears usernames', async () => {
    expect(await saveProxyConfig('egs', { username: 1 })).toMatch(/username/);
    expect(await saveProxyConfig('egs', { username: 'a'.repeat(257) })).toMatch(/long/);
    expect(await saveProxyConfig('egs', { username: ' user ' })).toBeNull();
    expect((await getProxyConfigForDisplay('egs')).username).toBe('user');
    expect(await saveProxyConfig('egs', { username: null })).toBeNull();
    expect((await getProxyConfigForDisplay('egs')).username).toBe('');
  });

  it('rejects malformed and oversized passwords and clears a null password', async () => {
    expect(await saveProxyConfig('egs', { password: 1 })).toMatch(/password/);
    expect(await saveProxyConfig('egs', { password: 'a'.repeat(257) })).toMatch(/long/);
    expect(await saveProxyConfig('egs', { password: 'stored' })).toBeNull();
    expect(await saveProxyConfig('egs', { password: null })).toBeNull();
    expect((await getProxyConfigForDisplay('egs')).hasPassword).toBe(false);
  });

  it('preserves existing password when sentinel submitted', async () => {
    await saveProxyConfig('egs', { password: 'secretpassword' });
    await saveProxyConfig('egs', { password: PROXY_PASSWORD_MASK });
    const display = await getProxyConfigForDisplay('egs');
    expect(display.hasPassword).toBe(true);
  });

  it('preserves existing password when empty string submitted', async () => {
    await saveProxyConfig('egs', { password: 'secretpassword' });
    await saveProxyConfig('egs', { password: '' });
    const display = await getProxyConfigForDisplay('egs');
    expect(display.hasPassword).toBe(true);
  });

  it('updates password when new value submitted', async () => {
    await saveProxyConfig('egs', { password: 'oldpassword' });
    await saveProxyConfig('egs', { password: 'newpassword' });
    const cfg = await resolveProxyConfig('egs');
    expect(cfg).toBeNull();
    await saveProxyConfig('egs', { enabled: true, host: 'h.example.com', port: 1080 });
    const cfg2 = await resolveProxyConfig('egs');
    expect(cfg2?.password).toBe('newpassword');
  });
});

describe('getProxyConfigForDisplay', () => {
  it('returns defaults when no config stored', async () => {
    const d = await getProxyConfigForDisplay('vndbmirror');
    expect(d).toMatchObject({ enabled: false, host: '', port: null, username: '', hasPassword: false });
  });

  it('reports hasPassword true when password stored', async () => {
    await saveProxyConfig('vndb', { password: 'hunter2' });
    expect((await getProxyConfigForDisplay('vndb')).hasPassword).toBe(true);
  });

  it('does not expose raw password', async () => {
    await saveProxyConfig('vndb', { password: 'hunter2' });
    const d = await getProxyConfigForDisplay('vndb');
    expect(JSON.stringify(d)).not.toContain('hunter2');
  });
});

describe('saveStockProviderProxyConfig', () => {
  it('rejects an invalid provider id', async () => {
    expect(await saveStockProviderProxyConfig('bad-id!', { enabled: true })).toMatch(/invalid/);
    expect(await saveStockProviderProxyConfig('', { enabled: true })).toMatch(/invalid/);
  });

  it('persists per-shop config under <id>_proxy_config', async () => {
    const err = await saveStockProviderProxyConfig('surugaya', {
      enabled: true,
      protocol: 'socks5h',
      host: 'jp.proxy.example.com',
      port: 1080,
    });
    expect(err).toBeNull();
    const display = await getStockProviderProxyDisplay('surugaya');
    expect(display).toMatchObject({ enabled: true, host: 'jp.proxy.example.com', port: 1080 });
  });

  it('preserves password when sentinel resubmitted', async () => {
    await saveStockProviderProxyConfig('amiami', { password: 'shop-pass-32' });
    await saveStockProviderProxyConfig('amiami', { password: PROXY_PASSWORD_MASK });
    expect((await getStockProviderProxyDisplay('amiami')).hasPassword).toBe(true);
  });

  it('rejects private/loopback host (SSRF/lateral)', async () => {
    expect(await saveStockProviderProxyConfig('joshin', { host: '127.0.0.1' })).toMatch(/private/);
    expect(await saveStockProviderProxyConfig('joshin', { host: '10.0.0.5' })).toMatch(/private/);
  });

  it('mirrors generic validation for per-shop overrides', async () => {
    expect(await saveStockProviderProxyConfig('sofmap', { enabled: 'true' })).toMatch(/enabled/);
    expect(await saveStockProviderProxyConfig('sofmap', { protocol: 1 })).toMatch(/protocol/);
    expect(await saveStockProviderProxyConfig('sofmap', { protocol: 'ftp' })).toMatch(/protocol/);
    expect(await saveStockProviderProxyConfig('sofmap', { host: 1 })).toMatch(/host/);
    expect(await saveStockProviderProxyConfig('sofmap', { host: 'a'.repeat(256) })).toMatch(/long/);
    expect(await saveStockProviderProxyConfig('sofmap', { host: '-bad.example.com' })).toMatch(/hostname/);
    expect(await saveStockProviderProxyConfig('sofmap', { host: '172.16.0.1' })).toMatch(/private/);
    expect(await saveStockProviderProxyConfig('sofmap', { port: 1.5 })).toMatch(/port/);
    expect(await saveStockProviderProxyConfig('sofmap', { username: 1 })).toMatch(/username/);
    expect(await saveStockProviderProxyConfig('sofmap', { username: 'a'.repeat(257) })).toMatch(/long/);
    expect(await saveStockProviderProxyConfig('sofmap', { password: 1 })).toMatch(/password/);
    expect(await saveStockProviderProxyConfig('sofmap', { password: 'a'.repeat(257) })).toMatch(/long/);
  });

  it('persists, trims, and clears each optional per-shop field', async () => {
    expect(await saveStockProviderProxyConfig('sofmap', {
      enabled: true,
      protocol: 'https',
      host: ' proxy.example.com ',
      port: '8443',
      username: ' user ',
      password: 'stored',
    })).toBeNull();
    expect(await getStockProviderProxyDisplay('sofmap')).toEqual({
      enabled: true,
      protocol: 'https',
      host: 'proxy.example.com',
      port: 8443,
      username: 'user',
      hasPassword: true,
    });
    expect(await saveStockProviderProxyConfig('sofmap', {
      host: null,
      port: '',
      username: null,
      password: null,
    })).toBeNull();
    expect(await getStockProviderProxyDisplay('sofmap')).toMatchObject({
      host: '',
      port: null,
      username: '',
      hasPassword: false,
    });
  });

  it('preserves a per-shop password on empty string and handles malformed stored JSON', async () => {
    await saveStockProviderProxyConfig('sofmap', { password: 'stored' });
    expect(await saveStockProviderProxyConfig('sofmap', { password: '' })).toBeNull();
    expect((await getStockProviderProxyDisplay('sofmap')).hasPassword).toBe(true);
    dbMock.setAppSetting('sofmap_proxy_config', 'not-json');
    expect(await getStockProviderProxyDisplay('sofmap')).toMatchObject({ enabled: false, host: '' });
  });
});

describe('resolveStockProviderProxy (two-tier)', () => {
  it('per-shop override beats the generic stock proxy', async () => {
    await saveProxyConfig('stock', { enabled: true, host: 'generic.example.com', port: 1080 });
    await saveStockProviderProxyConfig('surugaya', { enabled: true, host: 'sur.example.com', port: 1081 });
    const resolved = await resolveStockProviderProxy('surugaya');
    expect(resolved?.host).toBe('sur.example.com');
    expect(resolved?.port).toBe(1081);
  });

  it('falls back to the generic stock proxy when per-shop is disabled', async () => {
    await saveProxyConfig('stock', { enabled: true, host: 'generic.example.com', port: 1080 });
    await saveStockProviderProxyConfig('amazon_jp', { enabled: false, host: 'amazon.example.com', port: 1082 });
    const resolved = await resolveStockProviderProxy('amazon_jp');
    expect(resolved?.host).toBe('generic.example.com');
  });

  it('returns null when both per-shop AND generic are disabled', async () => {
    expect(await resolveStockProviderProxy('amiami')).toBeNull();
  });

  it('treats malformed shop ids as a fallback to the generic stock proxy', async () => {
    await saveProxyConfig('stock', { enabled: true, host: 'fallback.example.com', port: 1080 });
    const resolved = await resolveStockProviderProxy('bad-id!');
    // The fallback path resolves to the generic stock proxy — never to an
    // arbitrary `bad-id!_proxy_config` key.
    expect(resolved?.host).toBe('fallback.example.com');
  });

  it('reports whether a stock provider is proxied without exposing credentials', async () => {
    expect(await isStockProviderProxied('amiami')).toBe(false);
    await saveProxyConfig('stock', { enabled: true, host: 'generic.example.com', port: 1080 });
    expect(await isStockProviderProxied('amiami')).toBe(true);
  });

  it('uses the stored Stock proxy for AliceNet and ignores AliceNet-specific settings', async () => {
    dbMock.setAppSetting('alicenet_proxy_config', JSON.stringify({
      enabled: true,
      protocol: 'https',
      host: 'stored-alicenet.example.com',
      port: 8443,
    }));
    expect(await resolveStockProviderProxy('alicenet')).toBeNull();
    await saveProxyConfig('stock', {
      enabled: true,
      protocol: 'http',
      host: 'stored-stock.example.com',
      port: 8080,
    });
    expect(await resolveStockProviderProxy('alicenet')).toMatchObject({
      protocol: 'http',
      host: 'stored-stock.example.com',
      port: 8080,
    });
    expect(await isStockProviderProxied('alicenet')).toBe(true);
  });
});

describe('getStockProviderProxyDisplay', () => {
  it('returns safe defaults for an unconfigured shop', async () => {
    const d = await getStockProviderProxyDisplay('mandarake');
    expect(d).toMatchObject({ enabled: false, host: '', port: null, hasPassword: false });
  });

  it('returns safe defaults for a malformed shop id (no DB lookup)', async () => {
    const d = await getStockProviderProxyDisplay('bad-id!');
    expect(d).toMatchObject({ enabled: false, host: '', port: null, hasPassword: false });
  });

  it('never echoes the raw password', async () => {
    await saveStockProviderProxyConfig('sofmap', { password: 'sof-secret-32' });
    const d = await getStockProviderProxyDisplay('sofmap');
    expect(JSON.stringify(d)).not.toContain('sof-secret-32');
    expect(d.hasPassword).toBe(true);
  });

  it('falls back to the default protocol when a stored shop protocol is invalid', async () => {
    dbMock.setAppSetting('sofmap_proxy_config', JSON.stringify({ protocol: 'ftp' }));
    expect((await getStockProviderProxyDisplay('sofmap')).protocol).toBe('socks5h');
  });
});
