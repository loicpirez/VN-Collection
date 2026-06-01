import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  deriveVnAspectKey,
  getDisabledStockProviders,
  getCollectionItem,
  getProducer,
  getReleaseMeta,
  getSourcePref,
  listShelves,
  producerOwnershipSummary,
  searchLocalCharacters,
  setAppSetting,
} from '@/lib/db';

listShelves();

const VN_ID = 'v998801';
const CHARACTER_ID = 'c998801';
const PRODUCER_ID = 'p998801';

beforeEach(() => {
  db.prepare('DELETE FROM vndb_cache WHERE cache_key = ?').run(`char_full:${CHARACTER_ID}`);
  db.prepare('DELETE FROM character_vn_index WHERE character_id = ?').run(CHARACTER_ID);
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn_developer_index WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
  db.prepare('DELETE FROM release_meta_cache WHERE release_id = ?').run('r998801');
  db.prepare('DELETE FROM producer WHERE id = ?').run(PRODUCER_ID);
  setAppSetting('stock_disabled_providers', null);
});

describe('persisted JSON validation', () => {
  it('drops malformed source-preference maps', () => {
    const now = Date.now();
    db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(VN_ID, VN_ID, now);
    db.prepare('INSERT INTO collection (vn_id, status, source_pref, added_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(VN_ID, 'planning', JSON.stringify({ title: 'egs', injected: 'vndb' }), now, now);
    expect(getSourcePref(VN_ID)).toEqual({});
    db.prepare('UPDATE collection SET source_pref = ? WHERE vn_id = ?')
      .run(JSON.stringify({ title: 'egs', rating: 'custom' }), VN_ID);
    expect(getSourcePref(VN_ID)).toEqual({ title: 'egs', rating: 'custom' });
  });

  it('accepts only string arrays for disabled stock providers', () => {
    setAppSetting('stock_disabled_providers', JSON.stringify(['sofmap', 123]));
    expect([...getDisabledStockProviders()]).toEqual([]);
    setAppSetting('stock_disabled_providers', JSON.stringify(['sofmap', 'surugaya']));
    expect([...getDisabledStockProviders()]).toEqual(['sofmap', 'surugaya']);
  });

  it('falls back to empty release metadata arrays when stored shapes are invalid', () => {
    db.prepare(
      `INSERT INTO release_meta_cache (release_id, platforms, languages, fetched_at)
       VALUES (?, ?, ?, ?)`,
    ).run('r998801', JSON.stringify(['win', 123]), JSON.stringify([{ lang: 123 }]), Date.now());
    expect(getReleaseMeta('r998801')).toMatchObject({ platforms: [], languages: [] });
  });

  it('skips malformed local-character cache envelopes', () => {
    const now = Date.now();
    db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(VN_ID, VN_ID, now);
    db.prepare('INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(VN_ID, 'planning', now, now);
    db.prepare('INSERT INTO character_vn_index (character_id, vn_id) VALUES (?, ?)').run(CHARACTER_ID, VN_ID);
    db.prepare('INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(`char_full:${CHARACTER_ID}`, JSON.stringify({ profile: [] }), now, now + 10_000);
    expect(searchLocalCharacters({ q: CHARACTER_ID })).toEqual([]);
  });

  it('skips shallow local-character cache profiles', () => {
    const now = Date.now();
    db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(VN_ID, VN_ID, now);
    db.prepare('INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(VN_ID, 'planning', now, now);
    db.prepare('INSERT INTO character_vn_index (character_id, vn_id) VALUES (?, ?)').run(CHARACTER_ID, VN_ID);
    db.prepare('INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(`char_full:${CHARACTER_ID}`, JSON.stringify({ profile: { id: CHARACTER_ID, name: 'Incomplete' } }), now, now + 10_000);
    expect(searchLocalCharacters({ q: CHARACTER_ID })).toEqual([]);
  });

  it('falls back to empty arrays for parseable malformed VN JSON columns', () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO vn (id, title, languages, developers, tags, relations, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      VN_ID,
      VN_ID,
      JSON.stringify(['ja', 4]),
      JSON.stringify([{ id: 'bad', name: 'Studio' }]),
      JSON.stringify([{ id: 'g998801', name: 'Tag', rating: '3', spoiler: 0 }]),
      JSON.stringify([{ id: 'v998802', title: 'Incomplete' }]),
      now,
    );
    db.prepare('INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(VN_ID, 'planning', now, now);
    const item = getCollectionItem(VN_ID);
    expect(item?.languages).toEqual([]);
    expect(item?.developers).toEqual([]);
    expect(item?.tags).toEqual([]);
    expect(item?.relations).toEqual([]);
  });

  it('ignores malformed screenshot containers during aspect fallback', () => {
    db.prepare('INSERT INTO vn (id, title, screenshots, fetched_at) VALUES (?, ?, ?, ?)').run(
      VN_ID,
      VN_ID,
      JSON.stringify({ dims: [1920, 1080] }),
      Date.now(),
    );
    expect(deriveVnAspectKey(VN_ID)).toBe('unknown');
  });

  it('drops malformed producer samples before a detail page renders them', () => {
    const now = Date.now();
    db.prepare('INSERT INTO vn (id, title, developers, publishers, fetched_at) VALUES (?, ?, ?, ?, ?)').run(
      VN_ID,
      VN_ID,
      JSON.stringify({ id: 'p998801', name: 'Studio' }),
      JSON.stringify([{ id: 'bad', name: 'Publisher' }]),
      now,
    );
    db.prepare('INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(VN_ID, 'planning', now, now);
    db.prepare('INSERT INTO vn_developer_index (vn_id, producer_id) VALUES (?, ?)').run(VN_ID, 'p998801');
    expect(producerOwnershipSummary('p998801').sample).toEqual({ developers: [], publishers: [] });
  });

  it('drops malformed producer aliases and external links before rendering', () => {
    db.prepare(
      `INSERT INTO producer (id, name, aliases, extlinks, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      PRODUCER_ID,
      'Studio',
      JSON.stringify(['Alias', 4]),
      JSON.stringify([{ url: 'https://example.invalid', label: 7, name: 'site' }]),
      Date.now(),
    );
    expect(getProducer(PRODUCER_ID)).toMatchObject({ aliases: [], extlinks: [] });
  });
});
