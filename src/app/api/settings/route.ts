import { NextRequest, NextResponse } from 'next/server';
import { db, getAppSetting, getDisabledStockProviders, setAppSetting } from '@/lib/db';
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
  parseStaffDetailLayoutV1,
  validateStaffDetailLayoutV1,
} from '@/lib/staff-detail-layout';
import {
  parseCharacterDetailLayoutV1,
  validateCharacterDetailLayoutV1,
} from '@/lib/character-detail-layout';
import {
  parseProducerDetailLayoutV1,
  validateProducerDetailLayoutV1,
} from '@/lib/producer-detail-layout';
import {
  parseShelfViewPrefsV1,
  validateShelfViewPrefsV1,
  parseShelfDisplayOverridesV1,
  validateShelfDisplayOverridesV1,
} from '@/lib/shelf-view-prefs';
import { recordActivity } from '@/lib/activity';
import { isAllowedHttpTarget } from '@/lib/url-allowlist';
import {
  getProxyConfigForDisplay,
  getStockProviderProxyDisplay,
  saveProxyConfig,
  saveStockProviderProxyConfig,
  type ProviderId,
} from '@/lib/proxy-config';
import { STOCK_PROVIDER_IDS } from '@/lib/stock-provider-constants';
import { validateTokenShape } from '@/lib/input-validators';

import { readJsonObject } from '@/lib/api-body';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Per-shop override keys derived from `STOCK_PROVIDER_IDS`. */
const STOCK_PROVIDER_PROXY_KEYS = STOCK_PROVIDER_IDS.map((id) => `${id}_proxy_config`);
const STOCK_PROVIDER_PROXY_KEY_SET = new Set(STOCK_PROVIDER_PROXY_KEYS);

const SENSITIVE_LOG_KEYS = new Set<string>([
  'vndb_token',
  'steam_api_key',
  'vndb_backup_url',
  'vndb_proxy_config',
  'vndbmirror_proxy_config',
  'egs_proxy_config',
  'alicesoft_kobe_proxy_config',
  'stock_proxy_config',
  ...STOCK_PROVIDER_PROXY_KEYS,
]);

function maskPayloadValues(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, SENSITIVE_LOG_KEYS.has(k) ? '[REDACTED]' : v]),
  );
}

const SAFE_KEYS = new Set<string>([
  'vndb_token',
  'random_quote_source',
  'default_sort',
  'default_order',
  'default_group',
  'home_section_layout_v1',
  'vn_detail_section_layout_v1',
  'series_detail_section_layout_v1',
  'shelf_view_prefs_v1',
  // Per-shelf override hierarchy on top of `shelf_view_prefs_v1`.
  // Payload validated via `validateShelfDisplayOverridesV1`; PATCH
  // and GET handlers below wrap/unwrap the wider shape.
  'shelf_display_overrides_v1',
  // App-wide section ordering scopes — share the same versioned-
  // config pattern as VN/series detail. Added so PATCHes from
  // staff/character/producer pages can persist a layout.
  'staff_detail_section_layout_v1',
  'character_detail_section_layout_v1',
  'producer_detail_section_layout_v1',
  'vndb_writeback',
  'vndb_backup_url',
  'vndb_backup_enabled',
  'steam_api_key',
  'steam_id',
  'egs_username',
  'vndb_fanout',
  'vndb_proxy_config',
  'vndbmirror_proxy_config',
  'egs_proxy_config',
  'alicesoft_kobe_proxy_config',
  'stock_proxy_config',
  // Per-shop overrides — accepts `<provider>_proxy_config` for every
  // id in STOCK_PROVIDER_IDS. The PATCH handler validates the payload
  // through `saveStockProviderProxyConfig` so the shop id is checked
  // a second time before any DB write.
  ...STOCK_PROVIDER_PROXY_KEYS,
  // JSON array of StockProviderId values the operator has disabled.
  // Default (absent or null) = all providers enabled.
  'stock_disabled_providers',
  // Global toggle: retry a proxied stock provider over a direct
  // connection when the proxied attempt errors or returns zero offers.
  'stock_retry_without_proxy',
]);

/**
 * Thrown inside the PATCH write transaction when a proxy-config write
 * helper rejects its field-level patch. Carries the client-facing 400
 * message and rolls back every prior write in the same transaction.
 */
class SettingValidationError extends Error {}

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

export async function GET(req: Request): Promise<NextResponse> {
  // Settings hold the VNDB token, Steam API key, EGS username, and
  // backup URL. The GET path returns masked previews but still
  // confirms the existence of credentials — gated.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
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
      staff_detail_section_layout_v1: parseStaffDetailLayoutV1(getAppSetting('staff_detail_section_layout_v1')),
      character_detail_section_layout_v1: parseCharacterDetailLayoutV1(getAppSetting('character_detail_section_layout_v1')),
      producer_detail_section_layout_v1: parseProducerDetailLayoutV1(getAppSetting('producer_detail_section_layout_v1')),
      shelf_view_prefs_v1: parseShelfViewPrefsV1(getAppSetting('shelf_view_prefs_v1')),
      // Wrapped per-shelf overrides. The GET path always returns the
      // wrapped shape; the legacy `shelf_view_prefs_v1` key above
      // still carries the global defaults for back-compat callers.
      shelf_display_overrides_v1: parseShelfDisplayOverridesV1(
        getAppSetting('shelf_display_overrides_v1'),
      ),
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
      stock_disabled_providers: [...getDisabledStockProviders()],
      stock_retry_without_proxy: getAppSetting('stock_retry_without_proxy') === '1',
      vndb_proxy_config: getProxyConfigForDisplay('vndb'),
      vndbmirror_proxy_config: getProxyConfigForDisplay('vndbmirror'),
      egs_proxy_config: getProxyConfigForDisplay('egs'),
      alicesoft_kobe_proxy_config: getProxyConfigForDisplay('alicesoft_kobe'),
      stock_proxy_config: getProxyConfigForDisplay('stock'),
      // Per-shop overrides — one display row per stock provider id.
      // Spreading the object keeps the GET response shape flat so
      // existing clients don't need to change.
      ...Object.fromEntries(
        STOCK_PROVIDER_IDS.map((id) => [
          `${id}_proxy_config`,
          getStockProviderProxyDisplay(id),
        ]),
      ),
    });
  } catch (err) {
    console.error('[settings GET] DB error:', (err as Error).message);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  // PATCH can replace the token, backup URL, etc. — a remote
  // attacker who hits this can silently re-route every cached
  // /vn or /producer call through their server.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!SAFE_KEYS.has(key)) {
      return NextResponse.json({ error: `unknown setting: ${key}` }, { status: 400 });
    }
  }
  const changedKeys = Object.keys(body);
  const writes: Array<() => void> = [];
  try {
  if ('vndb_token' in body) {
    const v = body.vndb_token;
    if (v == null || v === '') {
      writes.push(() => setAppSetting('vndb_token', null));
    } else {
      const token = validateTokenShape(v, 'vndb_token');
      if (!token.ok) return NextResponse.json({ error: token.error }, { status: 400 });
      writes.push(() => setAppSetting('vndb_token', token.value));
    }
  }
  if ('random_quote_source' in body) {
    const v = body.random_quote_source;
    if (v !== 'all' && v !== 'mine') {
      return NextResponse.json({ error: 'random_quote_source must be all|mine' }, { status: 400 });
    }
    writes.push(() => setAppSetting('random_quote_source', v));
  }
  if ('default_sort' in body) {
    const v = body.default_sort;
    if (typeof v !== 'string' || !VALID_SORTS.has(v)) {
      return NextResponse.json({ error: `default_sort must be one of: ${[...VALID_SORTS].join(', ')}` }, { status: 400 });
    }
    writes.push(() => setAppSetting('default_sort', v));
  }
  if ('default_order' in body) {
    const v = body.default_order;
    if (typeof v !== 'string' || !VALID_ORDERS.has(v)) {
      return NextResponse.json({ error: `default_order must be one of: ${[...VALID_ORDERS].join(', ')}` }, { status: 400 });
    }
    writes.push(() => setAppSetting('default_order', v));
  }
  if ('default_group' in body) {
    const v = body.default_group;
    if (typeof v !== 'string' || !VALID_GROUPS.has(v)) {
      return NextResponse.json({ error: `default_group must be one of: ${[...VALID_GROUPS].join(', ')}` }, { status: 400 });
    }
    writes.push(() => setAppSetting('default_group', v));
  }
  if ('home_section_layout_v1' in body) {
    const v = body.home_section_layout_v1;
    if (v == null) {
      writes.push(() => setAppSetting('home_section_layout_v1', null));
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
      writes.push(() => setAppSetting('home_section_layout_v1', JSON.stringify(normalized)));
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
      writes.push(() => setAppSetting('vn_detail_section_layout_v1', null));
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      const normalized = validateVnDetailLayoutV1(v);
      writes.push(() => setAppSetting('vn_detail_section_layout_v1', JSON.stringify(normalized)));
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
      writes.push(() => setAppSetting('series_detail_section_layout_v1', null));
    } else if (typeof v === 'object' && !Array.isArray(v)) {
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
      writes.push(() => setAppSetting('series_detail_section_layout_v1', JSON.stringify(normalized)));
    } else {
      return NextResponse.json(
        { error: 'series_detail_section_layout_v1 must be an object or null' },
        { status: 400 },
      );
    }
  }
  for (const [key, parse, validate] of [
    ['staff_detail_section_layout_v1', parseStaffDetailLayoutV1, validateStaffDetailLayoutV1] as const,
    ['character_detail_section_layout_v1', parseCharacterDetailLayoutV1, validateCharacterDetailLayoutV1] as const,
    ['producer_detail_section_layout_v1', parseProducerDetailLayoutV1, validateProducerDetailLayoutV1] as const,
  ]) {
    if (!(key in body)) continue;
    const v = (body as Record<string, unknown>)[key];
    if (v == null) {
      writes.push(() => setAppSetting(key, null));
      continue;
    }
    if (typeof v !== 'object' || Array.isArray(v)) {
      return NextResponse.json(
        { error: `${key} must be an object or null` },
        { status: 400 },
      );
    }
    const current = parse(getAppSetting(key));
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
    const normalized = validate(merged);
    writes.push(() => setAppSetting(key, JSON.stringify(normalized)));
  }
  if ('shelf_view_prefs_v1' in body) {
    const v = body.shelf_view_prefs_v1;
    if (v == null) {
      writes.push(() => setAppSetting('shelf_view_prefs_v1', null));
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      const normalized = validateShelfViewPrefsV1(v);
      writes.push(() => setAppSetting('shelf_view_prefs_v1', JSON.stringify(normalized)));
    } else {
      return NextResponse.json(
        { error: 'shelf_view_prefs_v1 must be an object or null' },
        { status: 400 },
      );
    }
  }
  if ('shelf_display_overrides_v1' in body) {
    // Wrapped {global, shelves} payload. Partial merge: a PATCH that
    // sends only `{shelves: {[id]: {…}}}` keeps the persisted global
    // intact; conversely a PATCH sending only `{global: …}` keeps
    // every per-shelf override row intact. `null` resets to defaults.
    const v = body.shelf_display_overrides_v1;
    if (v == null) {
      writes.push(() => setAppSetting('shelf_display_overrides_v1', null));
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      const current = parseShelfDisplayOverridesV1(
        getAppSetting('shelf_display_overrides_v1'),
      );
      const patch = v as Record<string, unknown>;
      const merged = {
        global:
          patch.global !== undefined && typeof patch.global === 'object'
            ? patch.global
            : current.global,
        shelves:
          patch.shelves !== undefined && typeof patch.shelves === 'object'
            ? // Shallow-merge per shelf so a partial `{shelves:{a:…}}`
              // PATCH doesn't wipe out unrelated overrides.
              { ...current.shelves, ...(patch.shelves as Record<string, unknown>) }
            : current.shelves,
      };
      const normalized = validateShelfDisplayOverridesV1(merged);
      writes.push(() => setAppSetting('shelf_display_overrides_v1', JSON.stringify(normalized)));
    } else {
      return NextResponse.json(
        { error: 'shelf_display_overrides_v1 must be an object or null' },
        { status: 400 },
      );
    }
  }
  if ('vndb_writeback' in body) {
    if (typeof body.vndb_writeback !== 'boolean') {
      return NextResponse.json({ error: 'vndb_writeback must be boolean' }, { status: 400 });
    }
    const vndbWriteback = body.vndb_writeback;
    writes.push(() => setAppSetting('vndb_writeback', vndbWriteback ? '1' : null));
  }
  if ('stock_retry_without_proxy' in body) {
    if (typeof body.stock_retry_without_proxy !== 'boolean') {
      return NextResponse.json({ error: 'stock_retry_without_proxy must be boolean' }, { status: 400 });
    }
    const stockRetryWithoutProxy = body.stock_retry_without_proxy;
    writes.push(() => setAppSetting('stock_retry_without_proxy', stockRetryWithoutProxy ? '1' : null));
  }
  if ('vndb_backup_enabled' in body) {
    if (typeof body.vndb_backup_enabled !== 'boolean') {
      return NextResponse.json({ error: 'vndb_backup_enabled must be boolean' }, { status: 400 });
    }
    const vndbBackupEnabled = body.vndb_backup_enabled;
    writes.push(() => setAppSetting('vndb_backup_enabled', vndbBackupEnabled ? '1' : null));
  }
  if ('vndb_backup_url' in body) {
    const v = body.vndb_backup_url;
    if (v == null || v === '') {
      writes.push(() => setAppSetting('vndb_backup_url', null));
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (!/^https?:\/\//i.test(trimmed) || trimmed.length > 300) {
        return NextResponse.json({ error: 'vndb_backup_url must be a http(s) URL' }, { status: 400 });
      }
      if (!isAllowedHttpTarget(trimmed)) {
        return NextResponse.json(
          { error: 'vndb_backup_url must point to an allowed VNDB-compatible host (e.g. api.yorhel.org)' },
          { status: 400 },
        );
      }
      const normalizedUrl = trimmed.replace(/\/+$/, '');
      writes.push(() => setAppSetting('vndb_backup_url', normalizedUrl));
    } else {
      return NextResponse.json({ error: 'vndb_backup_url must be a string' }, { status: 400 });
    }
  }
  if ('vndb_fanout' in body) {
    if (typeof body.vndb_fanout !== 'boolean') {
      return NextResponse.json({ error: 'vndb_fanout must be boolean' }, { status: 400 });
    }
    const vndbFanout = body.vndb_fanout;
    writes.push(() => setAppSetting('vndb_fanout', vndbFanout === false ? '0' : null));
  }
  if ('steam_api_key' in body) {
    const v = body.steam_api_key;
    if (v == null || v === '') {
      writes.push(() => setAppSetting('steam_api_key', null));
    } else {
      const steamKey = validateTokenShape(v, 'steam_api_key');
      if (!steamKey.ok) return NextResponse.json({ error: steamKey.error }, { status: 400 });
      writes.push(() => setAppSetting('steam_api_key', steamKey.value));
    }
  }
  if ('steam_id' in body) {
    const v = body.steam_id;
    if (v == null || v === '') {
      writes.push(() => setAppSetting('steam_id', null));
    } else {
      const steamId = validateTokenShape(v, 'steam_id');
      if (!steamId.ok) return NextResponse.json({ error: steamId.error }, { status: 400 });
      writes.push(() => setAppSetting('steam_id', steamId.value));
    }
  }
  if ('egs_username' in body) {
    const v = body.egs_username;
    if (v == null || v === '') {
      writes.push(() => setAppSetting('egs_username', null));
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (!/^[A-Za-z0-9_]{1,32}$/.test(trimmed)) {
        return NextResponse.json({ error: 'invalid EGS username' }, { status: 400 });
      }
      writes.push(() => setAppSetting('egs_username', trimmed));
    } else {
      return NextResponse.json({ error: 'egs_username must be a string' }, { status: 400 });
    }
  }
  if ('stock_disabled_providers' in body) {
    const v = body.stock_disabled_providers;
    if (v == null) {
      writes.push(() => setAppSetting('stock_disabled_providers', null));
    } else if (Array.isArray(v) && v.every((item) => typeof item === 'string' && STOCK_PROVIDER_IDS.includes(item as (typeof STOCK_PROVIDER_IDS)[number]))) {
      const disabledProviders = [...new Set(v)];
      writes.push(() => setAppSetting('stock_disabled_providers', disabledProviders.length > 0 ? JSON.stringify(disabledProviders) : null));
    } else {
      return NextResponse.json({ error: 'stock_disabled_providers must be an array of valid provider IDs' }, { status: 400 });
    }
  }
  for (const [key, providerId] of [
    ['vndb_proxy_config', 'vndb'],
    ['vndbmirror_proxy_config', 'vndbmirror'],
    ['egs_proxy_config', 'egs'],
    ['alicesoft_kobe_proxy_config', 'alicesoft_kobe'],
    ['stock_proxy_config', 'stock'],
  ] as [string, ProviderId][]) {
    if (!(key in body)) continue;
    const v = body[key];
    if (typeof v !== 'object' || v == null || Array.isArray(v)) {
      return NextResponse.json(
        { error: `${key} must be an object` },
        { status: 400 },
      );
    }
    const patch = v as Record<string, unknown>;
    writes.push(() => {
      const err = saveProxyConfig(providerId, patch);
      if (err) throw new SettingValidationError(err);
    });
  }
  // Per-shop overrides. The membership in STOCK_PROVIDER_PROXY_KEY_SET is
  // the gate — saveStockProviderProxyConfig validates again before any
  // DB write so the shop id can never escape the allow-list.
  for (const key of Object.keys(body)) {
    if (!STOCK_PROVIDER_PROXY_KEY_SET.has(key)) continue;
    const v = body[key];
    if (typeof v !== 'object' || v == null || Array.isArray(v)) {
      return NextResponse.json(
        { error: `${key} must be an object` },
        { status: 400 },
      );
    }
    const providerId = key.replace(/_proxy_config$/, '');
    const patch = v as Record<string, unknown>;
    writes.push(() => {
      const err = saveStockProviderProxyConfig(providerId, patch);
      if (err) throw new SettingValidationError(`${key}: ${err}`);
    });
  }
    db.transaction(() => {
      for (const write of writes) write();
      if (changedKeys.length > 0) {
        recordActivity({
          kind: 'settings.update',
          entity: 'settings',
          label: 'Updated settings',
          payload: { keys: changedKeys, values: maskPayloadValues(body as Record<string, unknown>) },
        });
      }
    })();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SettingValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[settings PATCH] DB error:', (err as Error).message);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
