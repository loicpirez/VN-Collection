import { validateCharacterDetailLayoutV1, type CharacterDetailLayoutV1 } from './character-detail-layout';
import { validateHomeSectionLayoutV1, type HomeSectionLayoutV1 } from './home-section-layout';
import { asJsonRecord } from './json-shape';
import { validateProducerDetailLayoutV1, type ProducerDetailLayoutV1 } from './producer-detail-layout';
import { validateSeriesDetailLayoutV1, type SeriesDetailLayoutV1 } from './series-detail-layout';
import { validateStaffDetailLayoutV1, type StaffDetailLayoutV1 } from './staff-detail-layout';
import { STOCK_PROVIDER_IDS, type StockProviderId } from './stock-provider-constants';
import type { Status } from './types';
import { isVndbVnId, normalizeVnId } from './vn-id-shape';
import { validateVnDetailLayoutV1, type VnDetailLayoutV1 } from './vn-detail-layout';

const PROXY_PROTOCOLS = ['http', 'https', 'socks5', 'socks5h'] as const;
const SORT_KEYS = [
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
] as const;
const GROUP_KEYS = ['none', 'status', 'producer', 'publisher', 'tag', 'series', 'aspect'] as const;
const STATUS_KEYS: Status[] = ['planning', 'playing', 'completed', 'on_hold', 'dropped'];
const MAX_PULL_ROWS = 10_000;
const MAX_PULL_UNMATCHED_ROWS = 20;

/** Settings-modal sort key returned by the local settings endpoint. */
export type ServerSettingsSortKey = (typeof SORT_KEYS)[number];

/** Settings-modal group key returned by the local settings endpoint. */
export type ServerSettingsGroupKey = (typeof GROUP_KEYS)[number];

/** Password-redacted proxy configuration rendered by the settings modal. */
export interface ProxyDisplayConfig {
  enabled: boolean;
  protocol: (typeof PROXY_PROTOCOLS)[number];
  host: string;
  port: number | null;
  username: string;
  hasPassword: boolean;
}

/** Per-shop proxy key returned by the local settings endpoint. */
export type StockProviderProxyKey = `${StockProviderId}_proxy_config`;

interface FixedServerSettings {
  vndb_token: { hasToken: boolean; preview: string | null; envFallback: boolean };
  random_quote_source: 'all' | 'mine';
  default_sort: ServerSettingsSortKey;
  default_order: 'asc' | 'desc';
  default_group: ServerSettingsGroupKey;
  home_section_layout_v1: HomeSectionLayoutV1;
  vn_detail_section_layout_v1: VnDetailLayoutV1;
  series_detail_section_layout_v1: SeriesDetailLayoutV1;
  character_detail_section_layout_v1: CharacterDetailLayoutV1;
  staff_detail_section_layout_v1: StaffDetailLayoutV1;
  producer_detail_section_layout_v1: ProducerDetailLayoutV1;
  vndb_writeback: boolean;
  vndb_backup_enabled: boolean;
  vndb_backup_url: { hasUrl: boolean; host: string | null; isDefault: boolean };
  vndb_fanout: boolean;
  steam_api_key: { hasKey: boolean; preview: string | null };
  steam_id: string;
  egs_username: string;
  vndb_proxy_config: ProxyDisplayConfig;
  vndbmirror_proxy_config: ProxyDisplayConfig;
  egs_proxy_config: ProxyDisplayConfig;
  alicesoft_kobe_proxy_config: ProxyDisplayConfig;
  stock_proxy_config: ProxyDisplayConfig;
  stock_disabled_providers: StockProviderId[];
  stock_retry_without_proxy: boolean;
}

/** Settings-modal server state after local API validation. */
export type ServerSettings = FixedServerSettings & Partial<Record<StockProviderProxyKey, ProxyDisplayConfig>>;

/** VNDB status-pull diff rendered by the settings modal. */
export interface VndbPullStatusDiff {
  scanned: number;
  updated: number;
  unchanged: number;
  skippedNotInCollection: number;
  changes: { vn_id: string; title: string; from: Status | null; to: Status }[];
  unmatched: { vn_id: string; status: Status }[];
}

/** VNDB status-pull local API response after validation. */
export interface VndbPullStatusResult extends VndbPullStatusDiff {
  ok: boolean;
  needsAuth: boolean;
  message: string | null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUS_KEYS as string[]).includes(value);
}

function decodeProxyConfig(value: unknown): ProxyDisplayConfig | null {
  const row = asJsonRecord(value);
  return row &&
    typeof row.enabled === 'boolean' &&
    typeof row.protocol === 'string' &&
    (PROXY_PROTOCOLS as readonly string[]).includes(row.protocol) &&
    typeof row.host === 'string' &&
    (row.port === null || typeof row.port === 'number' && Number.isSafeInteger(row.port) && row.port >= 1 && row.port <= 65_535) &&
    typeof row.username === 'string' &&
    typeof row.hasPassword === 'boolean'
    ? {
        enabled: row.enabled,
        protocol: row.protocol as ProxyDisplayConfig['protocol'],
        host: row.host,
        port: row.port,
        username: row.username,
        hasPassword: row.hasPassword,
      }
    : null;
}

function decodeDisabledProviders(value: unknown): StockProviderId[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter(
    (id): id is StockProviderId =>
      typeof id === 'string' && (STOCK_PROVIDER_IDS as readonly string[]).includes(id),
  );
  return ids.length === value.length ? [...new Set(ids)] : null;
}

/**
 * Decode the local settings response before the modal renders masked credentials and defaults.
 *
 * @param value Parsed local API payload.
 * @returns Safe settings state, or `null` for malformed input.
 */
export function decodeServerSettingsResponse(value: unknown): ServerSettings | null {
  const row = asJsonRecord(value);
  const token = asJsonRecord(row?.vndb_token);
  const backup = asJsonRecord(row?.vndb_backup_url);
  const steamKey = asJsonRecord(row?.steam_api_key);
  const vndbProxy = decodeProxyConfig(row?.vndb_proxy_config);
  const mirrorProxy = decodeProxyConfig(row?.vndbmirror_proxy_config);
  const egsProxy = decodeProxyConfig(row?.egs_proxy_config);
  const kobeProxy = decodeProxyConfig(row?.alicesoft_kobe_proxy_config);
  const stockProxy = decodeProxyConfig(row?.stock_proxy_config);
  const disabledProviders = decodeDisabledProviders(row?.stock_disabled_providers);
  if (
    !row ||
    !token ||
    typeof token.hasToken !== 'boolean' ||
    !isNullableString(token.preview) ||
    typeof token.envFallback !== 'boolean' ||
    (row.random_quote_source !== 'all' && row.random_quote_source !== 'mine') ||
    typeof row.default_sort !== 'string' ||
    !(SORT_KEYS as readonly string[]).includes(row.default_sort) ||
    (row.default_order !== 'asc' && row.default_order !== 'desc') ||
    typeof row.default_group !== 'string' ||
    !(GROUP_KEYS as readonly string[]).includes(row.default_group) ||
    typeof row.vndb_writeback !== 'boolean' ||
    typeof row.vndb_backup_enabled !== 'boolean' ||
    !backup ||
    typeof backup.hasUrl !== 'boolean' ||
    !isNullableString(backup.host) ||
    typeof backup.isDefault !== 'boolean' ||
    typeof row.vndb_fanout !== 'boolean' ||
    !steamKey ||
    typeof steamKey.hasKey !== 'boolean' ||
    !isNullableString(steamKey.preview) ||
    typeof row.steam_id !== 'string' ||
    typeof row.egs_username !== 'string' ||
    !vndbProxy ||
    !mirrorProxy ||
    !egsProxy ||
    !kobeProxy ||
    !stockProxy ||
    !disabledProviders ||
    typeof row.stock_retry_without_proxy !== 'boolean'
  ) {
    return null;
  }
  const providerProxies: Partial<Record<StockProviderProxyKey, ProxyDisplayConfig>> = {};
  for (const id of STOCK_PROVIDER_IDS) {
    const key: StockProviderProxyKey = `${id}_proxy_config`;
    const proxy = decodeProxyConfig(row[key]);
    if (!proxy) return null;
    providerProxies[key] = proxy;
  }
  return {
    vndb_token: {
      hasToken: token.hasToken,
      preview: token.preview,
      envFallback: token.envFallback,
    },
    random_quote_source: row.random_quote_source,
    default_sort: row.default_sort as ServerSettingsSortKey,
    default_order: row.default_order,
    default_group: row.default_group as ServerSettingsGroupKey,
    home_section_layout_v1: validateHomeSectionLayoutV1(row.home_section_layout_v1),
    vn_detail_section_layout_v1: validateVnDetailLayoutV1(row.vn_detail_section_layout_v1),
    series_detail_section_layout_v1: validateSeriesDetailLayoutV1(row.series_detail_section_layout_v1),
    character_detail_section_layout_v1: validateCharacterDetailLayoutV1(row.character_detail_section_layout_v1),
    staff_detail_section_layout_v1: validateStaffDetailLayoutV1(row.staff_detail_section_layout_v1),
    producer_detail_section_layout_v1: validateProducerDetailLayoutV1(row.producer_detail_section_layout_v1),
    vndb_writeback: row.vndb_writeback,
    vndb_backup_enabled: row.vndb_backup_enabled,
    vndb_backup_url: {
      hasUrl: backup.hasUrl,
      host: backup.host,
      isDefault: backup.isDefault,
    },
    vndb_fanout: row.vndb_fanout,
    steam_api_key: {
      hasKey: steamKey.hasKey,
      preview: steamKey.preview,
    },
    steam_id: row.steam_id,
    egs_username: row.egs_username,
    vndb_proxy_config: vndbProxy,
    vndbmirror_proxy_config: mirrorProxy,
    egs_proxy_config: egsProxy,
    alicesoft_kobe_proxy_config: kobeProxy,
    stock_proxy_config: stockProxy,
    stock_disabled_providers: disabledProviders,
    stock_retry_without_proxy: row.stock_retry_without_proxy,
    ...providerProxies,
  };
}

/**
 * Decode a VNDB status-pull response before the settings modal renders its diff.
 *
 * @param value Parsed local API payload.
 * @returns Safe pull result, or `null` for malformed input.
 */
export function decodeVndbPullStatusResult(value: unknown): VndbPullStatusResult | null {
  const row = asJsonRecord(value);
  if (
    !row ||
    typeof row.ok !== 'boolean' ||
    !(row.needsAuth === undefined || typeof row.needsAuth === 'boolean') ||
    !(row.message === undefined || typeof row.message === 'string') ||
    !isNonNegativeInteger(row.scanned) ||
    !isNonNegativeInteger(row.updated) ||
    !isNonNegativeInteger(row.unchanged) ||
    !isNonNegativeInteger(row.skippedNotInCollection) ||
    !Array.isArray(row.changes) ||
    row.changes.length > MAX_PULL_ROWS ||
    !Array.isArray(row.unmatched) ||
    row.unmatched.length > MAX_PULL_UNMATCHED_ROWS
  ) {
    return null;
  }
  const changes: VndbPullStatusDiff['changes'] = [];
  for (const value of row.changes) {
    const change = asJsonRecord(value);
    if (
      !change ||
      typeof change.vn_id !== 'string' ||
      !isVndbVnId(change.vn_id) ||
      typeof change.title !== 'string' ||
      !(change.from === null || isStatus(change.from)) ||
      !isStatus(change.to)
    ) {
      return null;
    }
    changes.push({
      vn_id: normalizeVnId(change.vn_id),
      title: change.title,
      from: change.from,
      to: change.to,
    });
  }
  const unmatched: VndbPullStatusDiff['unmatched'] = [];
  for (const value of row.unmatched) {
    const entry = asJsonRecord(value);
    if (!entry || typeof entry.vn_id !== 'string' || !isVndbVnId(entry.vn_id) || !isStatus(entry.status)) {
      return null;
    }
    unmatched.push({ vn_id: normalizeVnId(entry.vn_id), status: entry.status });
  }
  return {
    ok: row.ok,
    needsAuth: row.needsAuth === true,
    message: typeof row.message === 'string' ? row.message : null,
    scanned: row.scanned,
    updated: row.updated,
    unchanged: row.unchanged,
    skippedNotInCollection: row.skippedNotInCollection,
    changes,
    unmatched,
  };
}
