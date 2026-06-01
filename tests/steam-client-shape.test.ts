import { describe, expect, it } from 'vitest';
import { decodeCollectionFindMatches } from '../src/lib/collection-find-client-shape';
import {
  decodeSteamAppliedCount,
  decodeSteamLibraryResult,
  decodeSteamLinks,
  decodeSteamSyncPreview,
} from '../src/lib/steam-client-shape';

describe('Steam client response adapters', () => {
  it('decodes preview, library, link, and apply responses', () => {
    expect(decodeSteamSyncPreview({
      ok: true,
      suggestions: [{
        vn_id: 'V90001',
        vn_title: 'Title',
        steam_appid: 1,
        steam_name: 'App',
        current_minutes: 0,
        steam_minutes: 10,
        delta: 10,
      }],
    })?.ok).toBe(true);
    expect(decodeSteamLibraryResult({ ok: true, games: [{ appid: 1, name: 'App', minutes: 10 }] })?.ok).toBe(true);
    expect(decodeSteamLinks({
      links: [{
        vn_id: 'V90001',
        appid: 1,
        steam_name: 'App',
        source: 'manual',
        last_synced_minutes: null,
        created_at: 1,
        updated_at: 1,
      }],
    })?.[0]?.vn_id).toBe('v90001');
    expect(decodeSteamAppliedCount({ applied: 1 })).toBe(1);
  });

  it('decodes structured failures and rejects malformed rows', () => {
    expect(decodeSteamSyncPreview({ ok: false, error: 'failed', code: 'steam_sync_failed' })).toEqual({
      ok: false,
      error: 'failed',
      code: 'steam_sync_failed',
    });
    expect(decodeSteamLibraryResult({ ok: false, error: 'failed' })).toEqual({ ok: false, error: 'failed' });
    expect(decodeSteamAppliedCount({ applied: -1 })).toBeNull();
    expect(decodeSteamLinks({ links: [{ vn_id: 'bad' }] })).toBeNull();
  });

  it('decodes local collection title matches with cover columns', () => {
    expect(decodeCollectionFindMatches({
      matches: [{
        id: 'V90001',
        title: 'Title',
        alttitle: null,
        image_url: null,
        image_thumb: null,
        local_image: 'vn/cover.webp',
        local_image_thumb: null,
        image_sexual: null,
      }],
    })?.[0]).toEqual({
      id: 'v90001',
      title: 'Title',
      alttitle: null,
      image_url: null,
      image_thumb: null,
      local_image: 'vn/cover.webp',
      local_image_thumb: null,
      image_sexual: null,
    });
  });
});
