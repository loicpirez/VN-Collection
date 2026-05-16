/**
 * Pin the masking contract for sensitive settings on /api/settings GET.
 *
 * The route is gated by `requireLocalhostOrToken`, but the GET response
 * must still never echo raw secret-shaped values:
 *   - VNDB token → masked to `…<tail4>`
 *   - Steam API key → boolean-only presence flag
 *   - VNDB backup URL → hostname preview only (NEW, added with this
 *     suite)
 *
 * These tests exercise the GET handler directly (no HTTP layer) using
 * the in-test SQLite isolation from tests/setup.ts. Synthetic
 * tokens / URLs only — no real credentials.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/settings/route';
import { setAppSetting } from '@/lib/db';

function buildRequest(): Request {
  // The route uses `requireLocalhostOrToken`. The test runner uses an
  // arbitrary localhost URL; the helper accepts loopback hostnames.
  return new Request('http://localhost/api/settings');
}

async function readSettings(): Promise<Record<string, unknown>> {
  const res = await GET(buildRequest());
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  // Clear sensitive keys between tests so leakage from one suite can't
  // mask a regression in another.
  setAppSetting('vndb_token', null);
  setAppSetting('steam_api_key', null);
  setAppSetting('vndb_backup_url', null);
});

describe('settings GET — sensitive value masking', () => {
  it('vndb_backup_url: never echoes raw URL — hostname-only preview', async () => {
    setAppSetting(
      'vndb_backup_url',
      'https://mirror.example.test/kana/v2?token=should-not-leak',
    );
    const body = await readSettings();
    const mask = body.vndb_backup_url as {
      hasUrl: boolean;
      host: string | null;
      isDefault: boolean;
    };
    expect(mask).toBeDefined();
    expect(mask.hasUrl).toBe(true);
    expect(mask.host).toBe('mirror.example.test');
    expect(mask.isDefault).toBe(false);
    // Critical: the raw string must NOT appear anywhere in the
    // serialised response.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('token=should-not-leak');
    expect(serialized).not.toContain('/kana/v2');
  });

  it('vndb_backup_url: unset value reports the default host + isDefault=true', async () => {
    const body = await readSettings();
    const mask = body.vndb_backup_url as {
      hasUrl: boolean;
      host: string | null;
      isDefault: boolean;
    };
    expect(mask.hasUrl).toBe(false);
    expect(mask.isDefault).toBe(true);
    expect(mask.host).not.toBeNull();
  });

  it('vndb_token: never echoes raw token — tail4 mask only', async () => {
    setAppSetting('vndb_token', 'super-secret-must-not-leak-AAAA-BBBB');
    const body = await readSettings();
    const mask = body.vndb_token as { hasToken: boolean; preview: string | null };
    expect(mask.hasToken).toBe(true);
    expect(mask.preview).toBe('…BBBB');
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('super-secret-must-not-leak');
    expect(serialized).not.toContain('AAAA-BBBB');
  });

  it('steam_api_key: boolean presence only — no preview at all', async () => {
    setAppSetting('steam_api_key', 'fake-test-token-not-a-real-vndb-credential');
    const body = await readSettings();
    const mask = body.steam_api_key as { hasKey: boolean; preview: string | null };
    expect(mask.hasKey).toBe(true);
    expect(mask.preview).toBeNull();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('fake-test-token');
  });
});
