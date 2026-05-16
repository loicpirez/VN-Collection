import { NextRequest, NextResponse } from 'next/server';
import { getAppSetting, setAppSetting } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SAFE_KEYS = new Set([
  'vndb_token',
  'random_quote_source',
  'default_sort',
  'default_order',
  'default_group',
  'vndb_writeback',
  'vndb_backup_url',
  'vndb_backup_enabled',
  'steam_api_key',
  'steam_id',
  'egs_username',
  'vndb_fanout',
]);

const DEFAULT_VNDB_BACKUP_URL = 'https://api.yorhel.org/kana';

// Mirror the validation surfaces of `LibraryClient.tsx` and
// `/api/collection`. `publisher` lived in those two but was missing here
// — the bug only surfaced when a user tried to persist publisher as the
// default sort and the PATCH route rejected it silently.
const VALID_SORTS = new Set([
  'updated_at',
  'added_at',
  'title',
  'rating',
  'user_rating',
  'playtime',
  'length_minutes',
  'egs_playtime',
  'combined_playtime',
  'released',
  'producer',
  'publisher',
  'egs_rating',
  'combined_rating',
  'custom',
]);

const VALID_GROUPS = new Set(['none', 'status', 'producer', 'publisher', 'tag', 'series']);
const VALID_ORDERS = new Set(['asc', 'desc']);

function maskToken(value: string | null): { hasToken: boolean; preview: string | null; envFallback: boolean } {
  const envFallback = !!process.env.VNDB_TOKEN;
  if (!value) return { hasToken: envFallback, preview: null, envFallback };
  const tail = value.slice(-4);
  return { hasToken: true, preview: `…${tail}`, envFallback };
}

export async function GET(req: Request) {
  // Settings hold the VNDB token, Steam API key, EGS username, and
  // backup URL. The GET path returns masked previews but still
  // confirms the existence of credentials — gated.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const tokenRow = getAppSetting('vndb_token');
  const steamKey = getAppSetting('steam_api_key');
  return NextResponse.json({
    vndb_token: maskToken(tokenRow),
    random_quote_source: getAppSetting('random_quote_source') ?? 'all',
    default_sort: getAppSetting('default_sort') ?? 'updated_at',
    default_order: getAppSetting('default_order') ?? 'desc',
    default_group: getAppSetting('default_group') ?? 'none',
    vndb_writeback: getAppSetting('vndb_writeback') === '1',
    vndb_backup_enabled: getAppSetting('vndb_backup_enabled') === '1',
    vndb_backup_url: getAppSetting('vndb_backup_url') ?? DEFAULT_VNDB_BACKUP_URL,
    // No more last-4 preview of the Steam API key — confirming
    // possession of a specific key by an attacker is information
    // disclosure. UI gets a boolean only.
    steam_api_key: { hasKey: !!steamKey, preview: null },
    steam_id: getAppSetting('steam_id') ?? '',
    egs_username: getAppSetting('egs_username') ?? '',
    vndb_fanout: getAppSetting('vndb_fanout') !== '0',
  });
}

export async function PATCH(req: NextRequest) {
  // PATCH can replace the token, backup URL, etc. — a remote
  // attacker who hits this can silently re-route every cached
  // /vn or /producer call through their server.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!SAFE_KEYS.has(key)) {
      return NextResponse.json({ error: `unknown setting: ${key}` }, { status: 400 });
    }
  }
  if ('vndb_token' in body) {
    const v = body.vndb_token;
    if (v == null || v === '') {
      setAppSetting('vndb_token', null);
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      // VNDB tokens are alphanumeric (usually starts with "vndb-"). 200 chars is plenty.
      if (trimmed.length > 200 || /[\s"]/.test(trimmed)) {
        return NextResponse.json({ error: 'invalid token format' }, { status: 400 });
      }
      setAppSetting('vndb_token', trimmed || null);
    } else {
      return NextResponse.json({ error: 'vndb_token must be a string' }, { status: 400 });
    }
  }
  if ('random_quote_source' in body) {
    const v = body.random_quote_source;
    if (v !== 'all' && v !== 'mine') {
      return NextResponse.json({ error: 'random_quote_source must be all|mine' }, { status: 400 });
    }
    setAppSetting('random_quote_source', v);
  }
  if ('default_sort' in body) {
    const v = body.default_sort;
    if (typeof v !== 'string' || !VALID_SORTS.has(v)) {
      return NextResponse.json({ error: `default_sort must be one of: ${[...VALID_SORTS].join(', ')}` }, { status: 400 });
    }
    setAppSetting('default_sort', v);
  }
  if ('default_order' in body) {
    const v = body.default_order;
    if (typeof v !== 'string' || !VALID_ORDERS.has(v)) {
      return NextResponse.json({ error: `default_order must be one of: ${[...VALID_ORDERS].join(', ')}` }, { status: 400 });
    }
    setAppSetting('default_order', v);
  }
  if ('default_group' in body) {
    const v = body.default_group;
    if (typeof v !== 'string' || !VALID_GROUPS.has(v)) {
      return NextResponse.json({ error: `default_group must be one of: ${[...VALID_GROUPS].join(', ')}` }, { status: 400 });
    }
    setAppSetting('default_group', v);
  }
  if ('vndb_writeback' in body) {
    // Strict boolean check — previously any truthy value (including
    // the string "false") was accepted.
    if (typeof body.vndb_writeback !== 'boolean') {
      return NextResponse.json({ error: 'vndb_writeback must be boolean' }, { status: 400 });
    }
    setAppSetting('vndb_writeback', body.vndb_writeback ? '1' : null);
  }
  if ('vndb_backup_enabled' in body) {
    if (typeof body.vndb_backup_enabled !== 'boolean') {
      return NextResponse.json({ error: 'vndb_backup_enabled must be boolean' }, { status: 400 });
    }
    setAppSetting('vndb_backup_enabled', body.vndb_backup_enabled ? '1' : null);
  }
  if ('vndb_backup_url' in body) {
    const v = body.vndb_backup_url;
    if (v == null || v === '') {
      setAppSetting('vndb_backup_url', null);
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (!/^https?:\/\//i.test(trimmed) || trimmed.length > 300) {
        return NextResponse.json({ error: 'vndb_backup_url must be a http(s) URL' }, { status: 400 });
      }
      // Strip trailing slash so concatenating `${base}${path}` always yields a single `/`.
      setAppSetting('vndb_backup_url', trimmed.replace(/\/+$/, ''));
    } else {
      return NextResponse.json({ error: 'vndb_backup_url must be a string' }, { status: 400 });
    }
  }
  if ('vndb_fanout' in body) {
    if (typeof body.vndb_fanout !== 'boolean') {
      return NextResponse.json({ error: 'vndb_fanout must be boolean' }, { status: 400 });
    }
    setAppSetting('vndb_fanout', body.vndb_fanout === false ? '0' : null);
  }
  if ('steam_api_key' in body) {
    const v = body.steam_api_key;
    if (v == null || v === '') {
      setAppSetting('steam_api_key', null);
    } else if (typeof v === 'string' && v.trim().length > 0) {
      setAppSetting('steam_api_key', v.trim().slice(0, 64));
    } else {
      return NextResponse.json({ error: 'steam_api_key must be a string' }, { status: 400 });
    }
  }
  if ('steam_id' in body) {
    const v = body.steam_id;
    if (v == null || v === '') {
      setAppSetting('steam_id', null);
    } else if (typeof v === 'string' && /^\d{4,20}$/.test(v.trim())) {
      setAppSetting('steam_id', v.trim());
    } else {
      return NextResponse.json({ error: 'steam_id must be a 64-bit numeric SteamID' }, { status: 400 });
    }
  }
  if ('egs_username' in body) {
    const v = body.egs_username;
    if (v == null || v === '') {
      setAppSetting('egs_username', null);
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed.length > 64 || /[\s'"\\]/.test(trimmed)) {
        return NextResponse.json({ error: 'invalid EGS username' }, { status: 400 });
      }
      setAppSetting('egs_username', trimmed);
    } else {
      return NextResponse.json({ error: 'egs_username must be a string' }, { status: 400 });
    }
  }
  return NextResponse.json({ ok: true });
}
