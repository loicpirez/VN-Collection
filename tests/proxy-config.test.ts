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
  it('returns null when not enabled', () => {
    expect(resolveProxyConfig('egs')).toBeNull();
  });

  it('returns null when env enabled but host missing', () => {
    vi.stubEnv('EGS_PROXY_ENABLED', 'true');
    expect(resolveProxyConfig('egs')).toBeNull();
  });

  it('returns null when env enabled and host present but port missing', () => {
    vi.stubEnv('EGS_PROXY_ENABLED', 'true');
    vi.stubEnv('EGS_PROXY_HOST', 'proxy.example.com');
    expect(resolveProxyConfig('egs')).toBeNull();
  });

  it('returns null when env enabled but port invalid', () => {
    vi.stubEnv('EGS_PROXY_ENABLED', 'true');
    vi.stubEnv('EGS_PROXY_HOST', 'proxy.example.com');
    vi.stubEnv('EGS_PROXY_PORT', 'notanumber');
    expect(resolveProxyConfig('egs')).toBeNull();
  });

  it('rejects partial numeric ports instead of accepting a parseInt prefix', () => {
    vi.stubEnv('EGS_PROXY_ENABLED', 'true');
    vi.stubEnv('EGS_PROXY_HOST', 'proxy.example.com');
    vi.stubEnv('EGS_PROXY_PORT', '1080junk');
    expect(resolveProxyConfig('egs')).toBeNull();
  });

  it('returns null when env port is outside the valid range or protocol is invalid', () => {
    vi.stubEnv('EGS_PROXY_ENABLED', 'true');
    vi.stubEnv('EGS_PROXY_HOST', 'proxy.example.com');
    vi.stubEnv('EGS_PROXY_PORT', '0');
    expect(resolveProxyConfig('egs')).toBeNull();
    vi.stubEnv('EGS_PROXY_PORT', '65536');
    expect(resolveProxyConfig('egs')).toBeNull();
    vi.stubEnv('EGS_PROXY_PORT', '1080');
    vi.stubEnv('EGS_PROXY_PROTOCOL', 'ftp');
    expect(resolveProxyConfig('egs')).toBeNull();
  });

  it('returns config from env vars', () => {
    vi.stubEnv('EGS_PROXY_ENABLED', '1');
    vi.stubEnv('EGS_PROXY_HOST', 'nl.socks.nordhold.net');
    vi.stubEnv('EGS_PROXY_PORT', '1080');
    vi.stubEnv('EGS_PROXY_PROTOCOL', 'socks5h');
    vi.stubEnv('EGS_PROXY_USERNAME', 'user');
    vi.stubEnv('EGS_PROXY_PASSWORD', 'secret');
    const cfg = resolveProxyConfig('egs');
    expect(cfg).toMatchObject({
      protocol: 'socks5h',
      host: 'nl.socks.nordhold.net',
      port: 1080,
      username: 'user',
      password: 'secret',
    });
  });

  it('defaults protocol to socks5h when not specified', () => {
    vi.stubEnv('EGS_PROXY_ENABLED', 'true');
    vi.stubEnv('EGS_PROXY_HOST', 'proxy.example.com');
    vi.stubEnv('EGS_PROXY_PORT', '1080');
    const cfg = resolveProxyConfig('egs');
    expect(cfg?.protocol).toBe('socks5h');
  });

  it('reads from DB when env vars absent', () => {
    const err = saveProxyConfig('vndb', {
      enabled: true,
      protocol: 'http',
      host: 'proxy.example.com',
      port: 8080,
    });
    expect(err).toBeNull();
    const cfg = resolveProxyConfig('vndb');
    expect(cfg).toMatchObject({ protocol: 'http', host: 'proxy.example.com', port: 8080 });
  });

  it('env ENABLED=false overrides DB enabled=true', () => {
    saveProxyConfig('egs', { enabled: true, host: 'proxy.example.com', port: 1080 });
    vi.stubEnv('EGS_PROXY_ENABLED', 'false');
    expect(resolveProxyConfig('egs')).toBeNull();
  });

  it('drops malformed stored fields instead of coercing them', () => {
    dbMock.setAppSetting('egs_proxy_config', JSON.stringify({
      enabled: 'true',
      host: ['proxy.example.com'],
      port: '1080',
      username: 42,
      password: false,
    }));
    expect(resolveProxyConfig('egs')).toBeNull();
    expect(getProxyConfigForDisplay('egs')).toMatchObject({
      enabled: false,
      host: '',
      port: null,
      username: '',
      hasPassword: false,
    });
  });

  it('drops malformed stored envelopes and reads all persisted scalar fields', () => {
    for (const raw of ['not-json', 'null', '1', '[]']) {
      dbMock.setAppSetting('egs_proxy_config', raw);
      expect(getProxyConfigForDisplay('egs')).toMatchObject({
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
    expect(resolveProxyConfig('egs')).toEqual({
      protocol: 'https',
      host: 'persisted.example.com',
      port: 8443,
      username: 'persisted-user',
      password: 'persisted-password',
    });
    expect(getProxyConfigForDisplay('egs').protocol).toBe('https');
  });

  it('normalizes empty stored credentials to null in an active resolved config', () => {
    dbMock.setAppSetting('egs_proxy_config', JSON.stringify({
      enabled: true,
      host: 'persisted.example.com',
      port: 1080,
      username: '',
      password: '',
    }));
    expect(resolveProxyConfig('egs')).toMatchObject({ username: null, password: null });
  });
});

describe('buildProxyUrl', () => {
  it('builds bare URL without credentials', () => {
    expect(
      buildProxyUrl({ protocol: 'socks5h', host: 'example.com', port: 1080, username: null, password: null }),
    ).toBe('socks5h://example.com:1080');
  });

  it('encodes credentials', () => {
    expect(
      buildProxyUrl({ protocol: 'http', host: 'proxy.example.com', port: 8080, username: 'u@ser', password: 'p@ss' }),
    ).toBe('http://u%40ser:p%40ss@proxy.example.com:8080');
  });

  it('omits password when null', () => {
    expect(
      buildProxyUrl({ protocol: 'http', host: 'h', port: 80, username: 'user', password: null }),
    ).toBe('http://user@h:80');
  });
});

describe('saveProxyConfig', () => {
  it('rejects invalid enabled and protocol types', () => {
    expect(saveProxyConfig('egs', { enabled: 'true' })).toMatch(/enabled/);
    expect(saveProxyConfig('egs', { protocol: 1 })).toMatch(/protocol/);
  });

  it('rejects invalid protocol', () => {
    expect(saveProxyConfig('egs', { protocol: 'ftp' })).toMatch(/protocol/);
  });

  it('rejects port out of range', () => {
    expect(saveProxyConfig('egs', { port: 99999 })).toMatch(/port/);
    expect(saveProxyConfig('egs', { port: 1.5 })).toMatch(/port/);
  });

  it('accepts string ports and clears empty ports', () => {
    expect(saveProxyConfig('egs', { port: '1080' })).toBeNull();
    expect(getProxyConfigForDisplay('egs').port).toBe(1080);
    expect(saveProxyConfig('egs', { port: '' })).toBeNull();
    expect(getProxyConfigForDisplay('egs').port).toBeNull();
    expect(saveProxyConfig('egs', { port: null })).toBeNull();
  });

  it('rejects private host', () => {
    expect(saveProxyConfig('egs', { host: '192.168.1.1' })).toMatch(/private/);
  });

  it('rejects localhost', () => {
    expect(saveProxyConfig('egs', { host: 'localhost' })).toMatch(/private/);
  });

  it('rejects malformed and oversized hosts and clears a null host', () => {
    expect(saveProxyConfig('egs', { host: 1 })).toMatch(/host/);
    expect(saveProxyConfig('egs', { host: 'a'.repeat(256) })).toMatch(/long/);
    expect(saveProxyConfig('egs', { host: '-bad.example.com' })).toMatch(/hostname/);
    expect(saveProxyConfig('egs', { host: '10.0.0.1' })).toMatch(/private/);
    expect(saveProxyConfig('egs', { host: '172.16.0.1' })).toMatch(/private/);
    expect(saveProxyConfig('egs', { host: null })).toBeNull();
    expect(getProxyConfigForDisplay('egs').host).toBe('');
  });

  it('validates, trims, and clears usernames', () => {
    expect(saveProxyConfig('egs', { username: 1 })).toMatch(/username/);
    expect(saveProxyConfig('egs', { username: 'a'.repeat(257) })).toMatch(/long/);
    expect(saveProxyConfig('egs', { username: ' user ' })).toBeNull();
    expect(getProxyConfigForDisplay('egs').username).toBe('user');
    expect(saveProxyConfig('egs', { username: null })).toBeNull();
    expect(getProxyConfigForDisplay('egs').username).toBe('');
  });

  it('rejects malformed and oversized passwords and clears a null password', () => {
    expect(saveProxyConfig('egs', { password: 1 })).toMatch(/password/);
    expect(saveProxyConfig('egs', { password: 'a'.repeat(257) })).toMatch(/long/);
    expect(saveProxyConfig('egs', { password: 'stored' })).toBeNull();
    expect(saveProxyConfig('egs', { password: null })).toBeNull();
    expect(getProxyConfigForDisplay('egs').hasPassword).toBe(false);
  });

  it('preserves existing password when sentinel submitted', () => {
    saveProxyConfig('egs', { password: 'secretpassword' });
    saveProxyConfig('egs', { password: PROXY_PASSWORD_MASK });
    const display = getProxyConfigForDisplay('egs');
    expect(display.hasPassword).toBe(true);
  });

  it('preserves existing password when empty string submitted', () => {
    saveProxyConfig('egs', { password: 'secretpassword' });
    saveProxyConfig('egs', { password: '' });
    const display = getProxyConfigForDisplay('egs');
    expect(display.hasPassword).toBe(true);
  });

  it('updates password when new value submitted', () => {
    saveProxyConfig('egs', { password: 'oldpassword' });
    saveProxyConfig('egs', { password: 'newpassword' });
    const cfg = resolveProxyConfig('egs');
    expect(cfg).toBeNull();
    saveProxyConfig('egs', { enabled: true, host: 'h.example.com', port: 1080 });
    const cfg2 = resolveProxyConfig('egs');
    expect(cfg2?.password).toBe('newpassword');
  });
});

describe('getProxyConfigForDisplay', () => {
  it('returns defaults when no config stored', () => {
    const d = getProxyConfigForDisplay('vndbmirror');
    expect(d).toMatchObject({ enabled: false, host: '', port: null, username: '', hasPassword: false });
  });

  it('reports hasPassword true when password stored', () => {
    saveProxyConfig('vndb', { password: 'hunter2' });
    expect(getProxyConfigForDisplay('vndb').hasPassword).toBe(true);
  });

  it('does not expose raw password', () => {
    saveProxyConfig('vndb', { password: 'hunter2' });
    const d = getProxyConfigForDisplay('vndb');
    expect(JSON.stringify(d)).not.toContain('hunter2');
  });
});

describe('saveStockProviderProxyConfig', () => {
  it('rejects an invalid provider id', () => {
    expect(saveStockProviderProxyConfig('bad-id!', { enabled: true })).toMatch(/invalid/);
    expect(saveStockProviderProxyConfig('', { enabled: true })).toMatch(/invalid/);
  });

  it('persists per-shop config under <id>_proxy_config', () => {
    const err = saveStockProviderProxyConfig('surugaya', {
      enabled: true,
      protocol: 'socks5h',
      host: 'jp.proxy.example.com',
      port: 1080,
    });
    expect(err).toBeNull();
    const display = getStockProviderProxyDisplay('surugaya');
    expect(display).toMatchObject({ enabled: true, host: 'jp.proxy.example.com', port: 1080 });
  });

  it('preserves password when sentinel resubmitted', () => {
    saveStockProviderProxyConfig('amiami', { password: 'shop-pass-32' });
    saveStockProviderProxyConfig('amiami', { password: PROXY_PASSWORD_MASK });
    expect(getStockProviderProxyDisplay('amiami').hasPassword).toBe(true);
  });

  it('rejects private/loopback host (SSRF/lateral)', () => {
    expect(saveStockProviderProxyConfig('joshin', { host: '127.0.0.1' })).toMatch(/private/);
    expect(saveStockProviderProxyConfig('joshin', { host: '10.0.0.5' })).toMatch(/private/);
  });

  it('mirrors generic validation for per-shop overrides', () => {
    expect(saveStockProviderProxyConfig('sofmap', { enabled: 'true' })).toMatch(/enabled/);
    expect(saveStockProviderProxyConfig('sofmap', { protocol: 1 })).toMatch(/protocol/);
    expect(saveStockProviderProxyConfig('sofmap', { protocol: 'ftp' })).toMatch(/protocol/);
    expect(saveStockProviderProxyConfig('sofmap', { host: 1 })).toMatch(/host/);
    expect(saveStockProviderProxyConfig('sofmap', { host: 'a'.repeat(256) })).toMatch(/long/);
    expect(saveStockProviderProxyConfig('sofmap', { host: '-bad.example.com' })).toMatch(/hostname/);
    expect(saveStockProviderProxyConfig('sofmap', { host: '172.16.0.1' })).toMatch(/private/);
    expect(saveStockProviderProxyConfig('sofmap', { port: 1.5 })).toMatch(/port/);
    expect(saveStockProviderProxyConfig('sofmap', { username: 1 })).toMatch(/username/);
    expect(saveStockProviderProxyConfig('sofmap', { username: 'a'.repeat(257) })).toMatch(/long/);
    expect(saveStockProviderProxyConfig('sofmap', { password: 1 })).toMatch(/password/);
    expect(saveStockProviderProxyConfig('sofmap', { password: 'a'.repeat(257) })).toMatch(/long/);
  });

  it('persists, trims, and clears each optional per-shop field', () => {
    expect(saveStockProviderProxyConfig('sofmap', {
      enabled: true,
      protocol: 'https',
      host: ' proxy.example.com ',
      port: '8443',
      username: ' user ',
      password: 'stored',
    })).toBeNull();
    expect(getStockProviderProxyDisplay('sofmap')).toEqual({
      enabled: true,
      protocol: 'https',
      host: 'proxy.example.com',
      port: 8443,
      username: 'user',
      hasPassword: true,
    });
    expect(saveStockProviderProxyConfig('sofmap', {
      host: null,
      port: '',
      username: null,
      password: null,
    })).toBeNull();
    expect(getStockProviderProxyDisplay('sofmap')).toMatchObject({
      host: '',
      port: null,
      username: '',
      hasPassword: false,
    });
  });

  it('preserves a per-shop password on empty string and handles malformed stored JSON', () => {
    saveStockProviderProxyConfig('sofmap', { password: 'stored' });
    expect(saveStockProviderProxyConfig('sofmap', { password: '' })).toBeNull();
    expect(getStockProviderProxyDisplay('sofmap').hasPassword).toBe(true);
    dbMock.setAppSetting('sofmap_proxy_config', 'not-json');
    expect(getStockProviderProxyDisplay('sofmap')).toMatchObject({ enabled: false, host: '' });
  });
});

describe('resolveStockProviderProxy (two-tier)', () => {
  it('per-shop override beats the generic stock proxy', () => {
    saveProxyConfig('stock', { enabled: true, host: 'generic.example.com', port: 1080 });
    saveStockProviderProxyConfig('surugaya', { enabled: true, host: 'sur.example.com', port: 1081 });
    const resolved = resolveStockProviderProxy('surugaya');
    expect(resolved?.host).toBe('sur.example.com');
    expect(resolved?.port).toBe(1081);
  });

  it('falls back to the generic stock proxy when per-shop is disabled', () => {
    saveProxyConfig('stock', { enabled: true, host: 'generic.example.com', port: 1080 });
    saveStockProviderProxyConfig('amazon_jp', { enabled: false, host: 'amazon.example.com', port: 1082 });
    const resolved = resolveStockProviderProxy('amazon_jp');
    expect(resolved?.host).toBe('generic.example.com');
  });

  it('returns null when both per-shop AND generic are disabled', () => {
    expect(resolveStockProviderProxy('amiami')).toBeNull();
  });

  it('treats malformed shop ids as a fallback to the generic stock proxy', () => {
    saveProxyConfig('stock', { enabled: true, host: 'fallback.example.com', port: 1080 });
    const resolved = resolveStockProviderProxy('bad-id!');
    // The fallback path resolves to the generic stock proxy — never to an
    // arbitrary `bad-id!_proxy_config` key.
    expect(resolved?.host).toBe('fallback.example.com');
  });

  it('reports whether a stock provider is proxied without exposing credentials', () => {
    expect(isStockProviderProxied('amiami')).toBe(false);
    saveProxyConfig('stock', { enabled: true, host: 'generic.example.com', port: 1080 });
    expect(isStockProviderProxied('amiami')).toBe(true);
  });
});

describe('getStockProviderProxyDisplay', () => {
  it('returns safe defaults for an unconfigured shop', () => {
    const d = getStockProviderProxyDisplay('mandarake');
    expect(d).toMatchObject({ enabled: false, host: '', port: null, hasPassword: false });
  });

  it('returns safe defaults for a malformed shop id (no DB lookup)', () => {
    const d = getStockProviderProxyDisplay('bad-id!');
    expect(d).toMatchObject({ enabled: false, host: '', port: null, hasPassword: false });
  });

  it('never echoes the raw password', () => {
    saveStockProviderProxyConfig('sofmap', { password: 'sof-secret-32' });
    const d = getStockProviderProxyDisplay('sofmap');
    expect(JSON.stringify(d)).not.toContain('sof-secret-32');
    expect(d.hasPassword).toBe(true);
  });

  it('falls back to the default protocol when a stored shop protocol is invalid', () => {
    dbMock.setAppSetting('sofmap_proxy_config', JSON.stringify({ protocol: 'ftp' }));
    expect(getStockProviderProxyDisplay('sofmap').protocol).toBe('socks5h');
  });
});
