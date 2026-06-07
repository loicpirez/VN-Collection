import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from '@/app/api/settings/route';
import { getAppSetting, setAppSetting } from '@/lib/db';
import * as activityModule from '@/lib/activity';
import { DEFAULT_HOME_LAYOUT } from '@/lib/home-section-layout';
import { defaultVnDetailLayoutV1 } from '@/lib/vn-detail-layout';
import { defaultSeriesDetailLayoutV1 } from '@/lib/series-detail-layout';
import { defaultStaffDetailLayoutV1 } from '@/lib/staff-detail-layout';
import { defaultCharacterDetailLayoutV1 } from '@/lib/character-detail-layout';
import { defaultProducerDetailLayoutV1 } from '@/lib/producer-detail-layout';
import { defaultShelfViewPrefsV1 } from '@/lib/shelf-view-prefs';

const RESET_KEYS = [
  'random_quote_source',
  'vndb_token',
  'default_sort',
  'default_order',
  'default_group',
  'home_section_layout_v1',
  'vn_detail_section_layout_v1',
  'series_detail_section_layout_v1',
  'staff_detail_section_layout_v1',
  'character_detail_section_layout_v1',
  'producer_detail_section_layout_v1',
  'shelf_view_prefs_v1',
  'shelf_display_overrides_v1',
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
  'stock_proxy_config',
  'sofmap_proxy_config',
  'stock_disabled_providers',
  'stock_retry_without_proxy',
] as const;

function patchRequest(body: unknown, url = 'http://127.0.0.1/api/settings'): NextRequest {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const key of RESET_KEYS) setAppSetting(key, null);
});

describe('settings route branches', () => {
  it('denies remote GET and PATCH requests', async () => {
    expect((await GET(new Request('http://remote.example/api/settings'))).status).toBe(403);
    expect((await PATCH(patchRequest({}, 'http://remote.example/api/settings'))).status).toBe(403);
  });

  it('rejects unknown and malformed scalar settings', async () => {
    expect((await PATCH(patchRequest({ unknown_setting: true }))).status).toBe(400);
    expect((await PATCH(patchRequest({ random_quote_source: 'bad' }))).status).toBe(400);
    expect((await PATCH(patchRequest({ default_sort: 'bad' }))).status).toBe(400);
    expect((await PATCH(patchRequest({ default_order: 'sideways' }))).status).toBe(400);
    expect((await PATCH(patchRequest({ default_group: 'bad' }))).status).toBe(400);
    expect((await PATCH(patchRequest({ egs_username: 'bad name' }))).status).toBe(400);
    expect((await PATCH(patchRequest({ egs_username: 123 }))).status).toBe(400);
    expect((await PATCH(patchRequest({ stock_retry_without_proxy: 'true' }))).status).toBe(400);
    expect((await PATCH(patchRequest({ vndb_writeback: 'true' }))).status).toBe(400);
    expect((await PATCH(patchRequest({ vndb_backup_enabled: 'true' }))).status).toBe(400);
    expect((await PATCH(patchRequest({ vndb_backup_url: 123 }))).status).toBe(400);
    expect((await PATCH(patchRequest({ vndb_fanout: 'false' }))).status).toBe(400);
  });

  it('persists scalar, URL, boolean, and stock-provider settings', async () => {
    const response = await PATCH(patchRequest({
      vndb_token: 'tok-valid.branch',
      random_quote_source: 'mine',
      default_sort: 'publisher',
      default_order: 'asc',
      default_group: 'publisher',
      vndb_writeback: true,
      vndb_backup_enabled: true,
      vndb_backup_url: 'https://api.yorhel.org/kana/',
      vndb_fanout: false,
      steam_api_key: '0123456789abcdef0123456789abcdef',
      steam_id: '76561197960287930',
      egs_username: 'Valid_123',
      stock_retry_without_proxy: true,
      stock_disabled_providers: ['sofmap', 'sofmap'],
    }));
    expect(response.status).toBe(200);
    expect(getAppSetting('vndb_token')).toBe('tok-valid.branch');
    expect(getAppSetting('random_quote_source')).toBe('mine');
    expect(getAppSetting('default_sort')).toBe('publisher');
    expect(getAppSetting('default_order')).toBe('asc');
    expect(getAppSetting('default_group')).toBe('publisher');
    expect(getAppSetting('vndb_writeback')).toBe('1');
    expect(getAppSetting('vndb_backup_enabled')).toBe('1');
    expect(getAppSetting('vndb_backup_url')).toBe('https://api.yorhel.org/kana');
    expect(getAppSetting('vndb_fanout')).toBe('0');
    expect(getAppSetting('steam_api_key')).toBe('0123456789abcdef0123456789abcdef');
    expect(getAppSetting('steam_id')).toBe('76561197960287930');
    expect(getAppSetting('egs_username')).toBe('Valid_123');
    expect(getAppSetting('stock_retry_without_proxy')).toBe('1');
    expect(getAppSetting('stock_disabled_providers')).toBe('["sofmap"]');

    const body = await (await GET(new Request('http://127.0.0.1/api/settings'))).json();
    expect(body.vndb_token).toMatchObject({ hasToken: true, preview: '…anch' });
    expect(body.steam_api_key).toEqual({ hasKey: true, preview: null });
  });

  it('rejects invalid backup URLs and stock-provider arrays', async () => {
    expect((await PATCH(patchRequest({ vndb_backup_url: 'ftp://api.yorhel.org/kana' }))).status).toBe(400);
    expect((await PATCH(patchRequest({ vndb_backup_url: 'https://example.test/kana' }))).status).toBe(400);
    expect((await PATCH(patchRequest({ stock_disabled_providers: ['bad_provider'] }))).status).toBe(400);
    const clear = await PATCH(patchRequest({ stock_disabled_providers: null }));
    expect(clear.status).toBe(200);
    expect(getAppSetting('stock_disabled_providers')).toBeNull();
    const empty = await PATCH(patchRequest({ stock_disabled_providers: [] }));
    expect(empty.status).toBe(200);
    expect(getAppSetting('stock_disabled_providers')).toBeNull();
  });

  it('persists and clears section layout settings', async () => {
    const vnLayout = defaultVnDetailLayoutV1();
    vnLayout.sections.notes.visible = false;
    const seriesLayout = defaultSeriesDetailLayoutV1();
    seriesLayout.sections.works.collapsedByDefault = true;
    const staffLayout = defaultStaffDetailLayoutV1();
    staffLayout.sections['voice-credits'].visible = false;
    const characterLayout = defaultCharacterDetailLayoutV1();
    characterLayout.sections['appears-in'].collapsedByDefault = true;
    const producerLayout = defaultProducerDetailLayoutV1();
    producerLayout.sections.works.visible = false;

    const response = await PATCH(patchRequest({
      home_section_layout_v1: { sections: { anniversary: { visible: false, collapsed: true } } },
      vn_detail_section_layout_v1: vnLayout,
      series_detail_section_layout_v1: seriesLayout,
      staff_detail_section_layout_v1: staffLayout,
      character_detail_section_layout_v1: characterLayout,
      producer_detail_section_layout_v1: producerLayout,
    }));
    expect(response.status).toBe(200);
    expect(getAppSetting('home_section_layout_v1')).toContain('anniversary');
    expect(getAppSetting('vn_detail_section_layout_v1')).toContain('"notes"');
    expect(getAppSetting('series_detail_section_layout_v1')).toContain('"works"');
    expect(getAppSetting('staff_detail_section_layout_v1')).toContain('"voice-credits"');
    expect(getAppSetting('character_detail_section_layout_v1')).toContain('"appears-in"');
    expect(getAppSetting('producer_detail_section_layout_v1')).toContain('"works"');

    const clear = await PATCH(patchRequest({
      home_section_layout_v1: null,
      vn_detail_section_layout_v1: null,
      series_detail_section_layout_v1: null,
      staff_detail_section_layout_v1: null,
      character_detail_section_layout_v1: null,
      producer_detail_section_layout_v1: null,
    }));
    expect(clear.status).toBe(200);
    expect(getAppSetting('home_section_layout_v1')).toBeNull();
    expect(getAppSetting('vn_detail_section_layout_v1')).toBeNull();
    expect(getAppSetting('series_detail_section_layout_v1')).toBeNull();
    expect(getAppSetting('staff_detail_section_layout_v1')).toBeNull();
  });

  it('merges layout patches that omit sections or order arrays', async () => {
    const response = await PATCH(patchRequest({
      home_section_layout_v1: { order: [...DEFAULT_HOME_LAYOUT.order].reverse() },
      series_detail_section_layout_v1: {},
      staff_detail_section_layout_v1: {},
    }));
    expect(response.status).toBe(200);
    expect(getAppSetting('home_section_layout_v1')).toContain(DEFAULT_HOME_LAYOUT.order[0]);
    expect(getAppSetting('series_detail_section_layout_v1')).toContain('"sections"');
    expect(getAppSetting('staff_detail_section_layout_v1')).toContain('"sections"');
  });

  it('persists and clears shelf display preferences', async () => {
    const prefs = defaultShelfViewPrefsV1();
    const response = await PATCH(patchRequest({
      shelf_view_prefs_v1: { ...prefs, fitMode: 'cover', cellWidthPx: 160 },
      shelf_display_overrides_v1: {
        global: { ...prefs, compact: true },
        shelves: {
          '1': { cellWidthPx: 180, compact: true },
        },
      },
    }));
    expect(response.status).toBe(200);
    expect(getAppSetting('shelf_view_prefs_v1')).toContain('"fitMode":"cover"');
    expect(getAppSetting('shelf_display_overrides_v1')).toContain('"shelves"');

    const partial = await PATCH(patchRequest({ shelf_display_overrides_v1: {} }));
    expect(partial.status).toBe(200);
    expect(getAppSetting('shelf_display_overrides_v1')).toContain('"shelves"');

    const clear = await PATCH(patchRequest({
      shelf_view_prefs_v1: null,
      shelf_display_overrides_v1: null,
    }));
    expect(clear.status).toBe(200);
    expect(getAppSetting('shelf_view_prefs_v1')).toBeNull();
    expect(getAppSetting('shelf_display_overrides_v1')).toBeNull();
  });

  it('rejects malformed layout payloads', async () => {
    expect((await PATCH(patchRequest({ home_section_layout_v1: [] }))).status).toBe(400);
    expect((await PATCH(patchRequest({ vn_detail_section_layout_v1: [] }))).status).toBe(400);
    expect((await PATCH(patchRequest({ series_detail_section_layout_v1: [] }))).status).toBe(400);
    expect((await PATCH(patchRequest({ staff_detail_section_layout_v1: [] }))).status).toBe(400);
    expect((await PATCH(patchRequest({ character_detail_section_layout_v1: [] }))).status).toBe(400);
    expect((await PATCH(patchRequest({ producer_detail_section_layout_v1: [] }))).status).toBe(400);
    expect((await PATCH(patchRequest({ shelf_view_prefs_v1: [] }))).status).toBe(400);
    expect((await PATCH(patchRequest({ shelf_display_overrides_v1: [] }))).status).toBe(400);
  });

  it('persists fixed and per-shop proxy settings and rejects invalid proxy payloads', async () => {
    const response = await PATCH(patchRequest({
      vndb_proxy_config: {
        enabled: true,
        protocol: 'http',
        host: 'proxy.example.test',
        port: 8080,
        username: 'proxy-user',
        password: 'proxy-pass',
      },
      sofmap_proxy_config: {
        enabled: true,
        protocol: 'socks5h',
        host: 'shop-proxy.example.test',
        port: '1080',
      },
    }));
    expect(response.status).toBe(200);
    expect(getAppSetting('vndb_proxy_config')).toContain('proxy.example.test');
    expect(getAppSetting('sofmap_proxy_config')).toContain('shop-proxy.example.test');

    const body = await (await GET(new Request('http://127.0.0.1/api/settings'))).json();
    expect(body.vndb_proxy_config).toMatchObject({ enabled: true, protocol: 'http', host: 'proxy.example.test', port: 8080, username: 'proxy-user', hasPassword: true });
    expect(body.sofmap_proxy_config).toMatchObject({ enabled: true, protocol: 'socks5h', host: 'shop-proxy.example.test', port: 1080 });

    expect((await PATCH(patchRequest({ vndb_proxy_config: [] }))).status).toBe(400);
    const fixedInvalid = await PATCH(patchRequest({ vndb_proxy_config: { enabled: 'yes' } }));
    expect(fixedInvalid.status).toBe(400);
    expect((await fixedInvalid.json()).error).toBe('enabled must be boolean');
    expect((await PATCH(patchRequest({ sofmap_proxy_config: [] }))).status).toBe(400);
    const invalid = await PATCH(patchRequest({ sofmap_proxy_config: { host: '127.0.0.1' } }));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toContain('sofmap_proxy_config');
  });

  it('clears nullable credential settings', async () => {
    setAppSetting('steam_api_key', 'existing-steam-key');
    setAppSetting('steam_id', '76561197960287930');
    setAppSetting('egs_username', 'ExistingUser');
    setAppSetting('vndb_backup_url', 'https://api.yorhel.org/kana');
    const response = await PATCH(patchRequest({
      steam_api_key: null,
      steam_id: '',
      egs_username: null,
      vndb_backup_url: '',
      vndb_writeback: false,
      vndb_backup_enabled: false,
      vndb_fanout: true,
      stock_retry_without_proxy: false,
    }));
    expect(response.status).toBe(200);
    expect(getAppSetting('steam_api_key')).toBeNull();
    expect(getAppSetting('steam_id')).toBeNull();
    expect(getAppSetting('egs_username')).toBeNull();
    expect(getAppSetting('vndb_backup_url')).toBeNull();
    expect(getAppSetting('vndb_writeback')).toBeNull();
    expect(getAppSetting('vndb_backup_enabled')).toBeNull();
    expect(getAppSetting('vndb_fanout')).toBeNull();
    expect(getAppSetting('stock_retry_without_proxy')).toBeNull();
  });

  it('masks malformed persisted backup URLs without throwing on GET', async () => {
    setAppSetting('vndb_backup_url', 'not a url');
    const response = await GET(new Request('http://127.0.0.1/api/settings'));
    expect(response.status).toBe(200);
    expect((await response.json()).vndb_backup_url).toEqual({
      hasUrl: true,
      host: null,
      isDefault: false,
    });
  });

  it('clears VNDB token and skips activity logging for empty PATCH bodies', async () => {
    setAppSetting('vndb_token', 'tok-existing');
    const clear = await PATCH(patchRequest({ vndb_token: null }));
    expect(clear.status).toBe(200);
    expect(getAppSetting('vndb_token')).toBeNull();

    const activitySpy = vi.spyOn(activityModule, 'recordActivity');
    try {
      const empty = await PATCH(patchRequest({}));
      expect(empty.status).toBe(200);
      expect(activitySpy).not.toHaveBeenCalled();
    } finally {
      activitySpy.mockRestore();
    }
  });

  it('returns a sanitized 500 when settings GET fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const settingSpy = vi.spyOn(await import('@/lib/db'), 'getAppSetting').mockImplementation(() => {
      throw new Error('private settings read failure');
    });
    try {
      const response = await GET(new Request('http://127.0.0.1/api/settings'));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'internal error' });
      expect(consoleSpy).toHaveBeenCalledWith('[settings GET] DB error:', 'private settings read failure');
    } finally {
      settingSpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });

  it('returns a sanitized 500 when the settings write transaction fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => {
      throw new Error('private settings transaction failure');
    });
    try {
      const response = await PATCH(patchRequest({ random_quote_source: 'mine' }));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'internal error' });
      expect(consoleSpy).toHaveBeenCalledWith('[settings PATCH] DB error:', 'private settings transaction failure');
    } finally {
      activitySpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });
});
