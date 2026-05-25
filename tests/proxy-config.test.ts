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
  PROXY_PASSWORD_MASK,
  resolveProxyConfig,
  saveProxyConfig,
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

  it('returns null when env enabled but port invalid', () => {
    vi.stubEnv('EGS_PROXY_ENABLED', 'true');
    vi.stubEnv('EGS_PROXY_HOST', 'proxy.example.com');
    vi.stubEnv('EGS_PROXY_PORT', 'notanumber');
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
  it('rejects invalid protocol', () => {
    expect(saveProxyConfig('egs', { protocol: 'ftp' })).toMatch(/protocol/);
  });

  it('rejects port out of range', () => {
    expect(saveProxyConfig('egs', { port: 99999 })).toMatch(/port/);
  });

  it('rejects private host', () => {
    expect(saveProxyConfig('egs', { host: '192.168.1.1' })).toMatch(/private/);
  });

  it('rejects localhost', () => {
    expect(saveProxyConfig('egs', { host: 'localhost' })).toMatch(/private/);
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
