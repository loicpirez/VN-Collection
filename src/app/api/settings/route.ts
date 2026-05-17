import { NextRequest, NextResponse } from 'next/server';
import { getAppSetting, setAppSetting } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import {
  parseHomeSectionLayoutV1,
  validateHomeSectionLayoutV1,
} from '@/lib/home-section-layout';
import {
  parseVnDetailLayoutV1,
  validateVnDetailLayoutV1,
} from '@/lib/vn-detail-layout';
import {
  parseSeriesDetailLayoutV1,
  validateSeriesDetailLayoutV1,
} from '@/lib/series-detail-layout';
import {
  parseShelfViewPrefsV1,
  validateShelfViewPrefsV1,
} from '@/lib/shelf-view-prefs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SAFE_KEYS = new Set([
  'vndb_token',
  'random_quote_source',
  'default_sort',
  'default_order',
  'default_group',
  'home_section_layout_v1',
  'vn_detail_section_layout_v1',
  'series_detail_section_layout_v1',
  'shelf_view_prefs_v1',
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

const VALID_GROUPS = new Set(['none', 'status', 'producer', 'publisher', 'tag', 'series', 'aspect']);
const VALID_ORDERS = new Set(['asc', 'desc']);

function maskToken(value: string | null): { hasToken: boolean; preview: string | null; envFallback: boolean } {
  const envFallback = !!process.env.VNDB_TOKEN;
  if (!value) return { hasToken: envFallback, preview: null, envFallback };
  const tail = value.slice(-4);
  return { hasToken: true, preview: `…${tail}`, envFallback };
}

/**
 * Mask a backup URL for GET responses. Returns a hostname-only preview
 * so the user can confirm "what host am I currently routing through"
 * without echoing query strings, paths, or any embedded credentials.
 * The raw URL still lives in the DB; the editor UI uses the preview
 * plus a separate write path (PATCH) to replace the value. This
 * mirrors Steam's mask pattern: presence + minimal identifier, never
 * the full secret-shaped value.
 */
function maskBackupUrl(value: string | null): {
  hasUrl: boolean;
  host: string | null;
  isDefault: boolean;
} {
  const effective = value ?? DEFAULT_VNDB_BACKUP_URL;
  const isDefault = !value || value === DEFAULT_VNDB_BACKUP_URL;
  let host: string | null = null;
  try {
    host = new URL(effective).host;
  } catch {
    host = null;
  }
  return { hasUrl: !!value, host, isDefault };
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
    home_section_layout_v1: parseHomeSectionLayoutV1(getAppSetting('home_section_layout_v1')),
    vn_detail_section_layout_v1: parseVnDetailLayoutV1(getAppSetting('vn_detail_section_layout_v1')),
    series_detail_section_layout_v1: parseSeriesDetailLayoutV1(getAppSetting('series_detail_section_layout_v1')),
    shelf_view_prefs_v1: parseShelfViewPrefsV1(getAppSetting('shelf_view_prefs_v1')),
    vndb_writeback: getAppSetting('vndb_writeback') === '1',
    vndb_backup_enabled: getAppSetting('vndb_backup_enabled') === '1',
    // Mask: never echo the raw URL on GET (it can contain auth
    // tokens, query strings, or proxy paths the user pasted without
    // realizing). The UI uses `host` to display "currently routing
    // through <host>" and PATCHes the full URL when the user edits.
    vndb_backup_url: maskBackupUrl(getAppSetting('vndb_backup_url')),
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
  if ('home_section_layout_v1' in body) {
    const v = body.home_section_layout_v1;
    if (v == null) {
      // Reset to defaults.
      setAppSetting('home_section_layout_v1', null);
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      // Partial patches are merged on top of the persisted layout so a
      // single section's hide/collapse doesn't clobber the order array
      // or sibling sections. The per-strip menu only sends
      // `{ sections: { [id]: state } }`; the drag-reorder handler only
      // sends `{ order: [...] }`. Full payloads are accepted too for
      // import/reset paths.
      const current = parseHomeSectionLayoutV1(getAppSetting('home_section_layout_v1'));
      const patch = v as Record<string, unknown>;
      const merged: unknown = {
        sections: {
          ...current.sections,
          ...(typeof patch.sections === 'object' && patch.sections !== null
            ? (patch.sections as Record<string, unknown>)
            : {}),
        },
        order: Array.isArray(patch.order) ? patch.order : current.order,
      };
      const normalized = validateHomeSectionLayoutV1(merged);
      setAppSetting('home_section_layout_v1', JSON.stringify(normalized));
    } else {
      return NextResponse.json(
        { error: 'home_section_layout_v1 must be an object or null' },
        { status: 400 },
      );
    }
  }
  if ('vn_detail_section_layout_v1' in body) {
    const v = body.vn_detail_section_layout_v1;
    if (v == null) {
      // Reset-to-default: drop the row so the parser falls back.
      setAppSetting('vn_detail_section_layout_v1', null);
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      // Round-trip through the validator so unknown ids / bogus values
      // never persist to app_setting.
      const normalized = validateVnDetailLayoutV1(v);
      setAppSetting('vn_detail_section_layout_v1', JSON.stringify(normalized));
    } else {
      return NextResponse.json(
        { error: 'vn_detail_section_layout_v1 must be an object or null' },
        { status: 400 },
      );
    }
  }
  if ('series_detail_section_layout_v1' in body) {
    const v = body.series_detail_section_layout_v1;
    if (v == null) {
      setAppSetting('series_detail_section_layout_v1', null);
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      // Same merge-on-top-of-persisted strategy as the home layout so
      // partial patches from the per-section menu or drag-reorder don't
      // clobber each other.
      const current = parseSeriesDetailLayoutV1(getAppSetting('series_detail_section_layout_v1'));
      const patch = v as Record<string, unknown>;
      const merged: unknown = {
        sections: {
          ...current.sections,
          ...(typeof patch.sections === 'object' && patch.sections !== null
            ? (patch.sections as Record<string, unknown>)
            : {}),
        },
        order: Array.isArray(patch.order) ? patch.order : current.order,
      };
      const normalized = validateSeriesDetailLayoutV1(merged);
      setAppSetting('series_detail_section_layout_v1', JSON.stringify(normalized));
    } else {
      return NextResponse.json(
        { error: 'series_detail_section_layout_v1 must be an object or null' },
        { status: 400 },
      );
    }
  }
  if ('shelf_view_prefs_v1' in body) {
    const v = body.shelf_view_prefs_v1;
    if (v == null) {
      setAppSetting('shelf_view_prefs_v1', null);
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      // Validator clamps sliders to documented ranges so a malicious
      // PATCH can't store `cellSizePx: 99999` and break the grid layout.
      const normalized = validateShelfViewPrefsV1(v);
      setAppSetting('shelf_view_prefs_v1', JSON.stringify(normalized));
    } else {
      return NextResponse.json(
        { error: 'shelf_view_prefs_v1 must be an object or null' },
        { status: 400 },
      );
    }
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
