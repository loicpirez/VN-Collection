/**
 * Pins the `password: null` → clear-stored-password semantics added
 * after the Integrations Settings UX rework. Three intents:
 *  - `null`              → drop the stored password
 *  - `''` or the mask    → no-op (form blur / mask echo)
 *  - other string        → save as new password
 *
 * We verify against the on-disk `app_setting` row directly because
 * `resolveProxyConfig` returns null when the proxy lacks a host
 * (the user can't even use it), and `getProxyConfigForDisplay`
 * intentionally masks the password.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface StoredRow {
  enabled?: boolean;
  host?: string;
  port?: number;
  protocol?: string;
  username?: string;
  password?: string;
}

describe('saveProxyConfig: password handling', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'proxy-password-clear-'));
    process.env.DB_PATH = join(tmpDir, 'test.db');
    process.env.STORAGE_ROOT = join(tmpDir, 'storage');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DB_PATH;
    delete process.env.STORAGE_ROOT;
  });

  it('writes a real password, then clears it on `password: null`', async () => {
    const proxy = await import('../src/lib/proxy-config');
    const { getAppSetting } = await import('../src/lib/db');

    expect(
      proxy.saveProxyConfig('egs', {
        enabled: true,
        host: 'proxy.test',
        port: 1080,
        protocol: 'socks5h',
        password: 'sekret',
      }),
    ).toBeNull();
    const beforeClear = JSON.parse(getAppSetting('egs_proxy_config') ?? '{}') as StoredRow;
    expect(beforeClear.password).toBe('sekret');

    expect(proxy.saveProxyConfig('egs', { password: null })).toBeNull();
    const afterClear = JSON.parse(getAppSetting('egs_proxy_config') ?? '{}') as StoredRow;
    expect(afterClear.password).toBeUndefined();
  });

  it('no-ops on empty string and on the mask', async () => {
    const proxy = await import('../src/lib/proxy-config');
    const { getAppSetting } = await import('../src/lib/db');

    expect(
      proxy.saveProxyConfig('egs', {
        enabled: true,
        host: 'proxy.test',
        port: 1080,
        protocol: 'socks5h',
        password: 'sekret',
      }),
    ).toBeNull();
    expect(proxy.saveProxyConfig('egs', { password: '' })).toBeNull();
    expect((JSON.parse(getAppSetting('egs_proxy_config') ?? '{}') as StoredRow).password).toBe('sekret');

    expect(proxy.saveProxyConfig('egs', { password: proxy.PROXY_PASSWORD_MASK })).toBeNull();
    expect((JSON.parse(getAppSetting('egs_proxy_config') ?? '{}') as StoredRow).password).toBe('sekret');
  });
});
