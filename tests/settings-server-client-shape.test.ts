import { describe, expect, it } from 'vitest';
import { STOCK_PROVIDER_IDS } from '@/lib/stock-provider-constants';
import {
  decodeServerSettingsResponse,
  decodeVndbPullStatusResult,
} from '@/lib/settings-server-client-shape';

const proxy = {
  enabled: false,
  protocol: 'socks5h',
  host: '',
  port: null,
  username: '',
  hasPassword: false,
};

function settingsPayload(): Record<string, unknown> {
  return {
    vndb_token: { hasToken: false, preview: null, envFallback: false },
    random_quote_source: 'all',
    default_sort: 'updated_at',
    default_order: 'desc',
    default_group: 'none',
    home_section_layout_v1: {},
    vn_detail_section_layout_v1: {},
    series_detail_section_layout_v1: {},
    character_detail_section_layout_v1: {},
    staff_detail_section_layout_v1: {},
    producer_detail_section_layout_v1: {},
    vndb_writeback: false,
    vndb_backup_enabled: false,
    vndb_backup_url: { hasUrl: false, host: 'api.example.test', isDefault: true },
    vndb_fanout: true,
    steam_api_key: { hasKey: false, preview: null },
    steam_id: '',
    egs_username: '',
    vndb_proxy_config: proxy,
    vndbmirror_proxy_config: proxy,
    egs_proxy_config: proxy,
    stock_proxy_config: proxy,
    stock_disabled_providers: ['sofmap'],
    stock_retry_without_proxy: false,
    ...Object.fromEntries(STOCK_PROVIDER_IDS.map((id) => [`${id}_proxy_config`, proxy])),
  };
}

describe('settings server client response decoders', () => {
  it('decodes modal settings and per-shop proxy rows', () => {
    const decoded = decodeServerSettingsResponse(settingsPayload());
    expect(decoded?.default_sort).toBe('updated_at');
    expect(decoded?.sofmap_proxy_config).toEqual(proxy);
    expect(decoded?.stock_disabled_providers).toEqual(['sofmap']);
    expect(decodeServerSettingsResponse({
      ...settingsPayload(),
      vndb_proxy_config: { ...proxy, port: 1080 },
      stock_disabled_providers: ['sofmap', 'sofmap'],
    })?.vndb_proxy_config.port).toBe(1080);
    expect(decodeServerSettingsResponse({
      ...settingsPayload(),
      random_quote_source: 'mine',
    })?.random_quote_source).toBe('mine');
  });

  it('rejects malformed credential and proxy rows', () => {
    expect(decodeServerSettingsResponse({ ...settingsPayload(), steam_api_key: { hasKey: 'yes' } })).toBeNull();
    expect(decodeServerSettingsResponse({ ...settingsPayload(), sofmap_proxy_config: { ...proxy, port: 0 } })).toBeNull();
    expect(decodeServerSettingsResponse({ ...settingsPayload(), stock_disabled_providers: ['bad'] })).toBeNull();
    expect(decodeServerSettingsResponse({ ...settingsPayload(), stock_disabled_providers: null })).toBeNull();
  });

  it('decodes VNDB pull status diffs and rejects malformed VN ids', () => {
    const payload = {
      ok: true,
      scanned: 2,
      updated: 1,
      unchanged: 0,
      skippedNotInCollection: 1,
      changes: [{ vn_id: 'V90017', title: 'Title', from: null, to: 'planning' }],
      unmatched: [{ vn_id: 'v90018', status: 'completed' }],
    };
    expect(decodeVndbPullStatusResult(payload)?.changes[0]?.vn_id).toBe('v90017');
    expect(decodeVndbPullStatusResult({
      ...payload,
      needsAuth: true,
      message: 'authorization required',
      changes: [{ vn_id: 'V90017', title: 'Title', from: 'playing', to: 'completed' }],
    })).toMatchObject({
      needsAuth: true,
      message: 'authorization required',
      changes: [{ from: 'playing', to: 'completed' }],
    });
    expect(decodeVndbPullStatusResult({
      ...payload,
      changes: Array(10_001).fill(null),
    })).toBeNull();
    expect(decodeVndbPullStatusResult({
      ...payload,
      unmatched: Array(21).fill(null),
    })).toBeNull();
    expect(decodeVndbPullStatusResult({
      ...payload,
      unmatched: [{ vn_id: 'bad', status: 'completed' }],
    })).toBeNull();
    expect(decodeVndbPullStatusResult({
      ...payload,
      changes: [{ vn_id: 'bad', title: 'Title', from: null, to: 'planning' }],
    })).toBeNull();
  });
});
