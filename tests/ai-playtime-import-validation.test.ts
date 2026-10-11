import { describe, expect, it } from 'vitest';
import { decodeCollectionImportPayload } from '@/lib/collection-import';
import type { CollectionExportPayload } from '@/lib/db';

const ai = {
  ai_playtime_minutes: 900,
  ai_playtime_lower_minutes: 720,
  ai_playtime_upper_minutes: 1080,
  ai_playtime_confidence: 0.8,
  ai_playtime_model: 'synthetic-estimator',
  ai_playtime_rationale: 'Synthetic estimate.',
  ai_playtime_generated_at: 1_700_000_000_000,
};

function payload(entry: Partial<CollectionExportPayload['collection'][number]>): CollectionExportPayload {
  return {
    version: 2,
    exported_at: 1_700_000_000_000,
    vns: [],
    collection: [{ vn_id: 'v90001', status: 'planning', user_rating: null,
      started_date: null, finished_date: null, notes: null, edition_label: null,
      physical_location: null, added_at: 1, updated_at: 1, ...entry }],
    series: [],
    series_vn: [],
  };
}

describe('AI provenance in collection backups', () => {
  it('retains all seven AI fields and valid preferences', () => {
    const input = payload({ ...ai, source_pref: '{"playtime":"ai","title":"vndb"}' });
    const decoded = decodeCollectionImportPayload(input);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.value.collection[0]).toMatchObject(input.collection[0]);
  });

  it('supports old backups without synthesizing or clearing AI data', () => {
    const decoded = decodeCollectionImportPayload(payload({}));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.value.collection[0]).not.toHaveProperty('ai_playtime_minutes');
    expect(decoded.value.collection[0]).not.toHaveProperty('source_pref');
  });

  it('preserves an explicitly cleared estimate and optional null metadata', () => {
    const cleared = Object.fromEntries(Object.keys(ai).map((key) => [key, null]));
    const decoded = decodeCollectionImportPayload(payload({ ...cleared, source_pref: null }));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.value.collection[0]).toMatchObject({ ...cleared, source_pref: null });
    expect(decodeCollectionImportPayload(payload({ ...ai, ai_playtime_confidence: null, ai_playtime_rationale: null })).ok).toBe(true);
  });

  it('rejects a partial estimate before any mutation', () => {
    expect(decodeCollectionImportPayload(payload({ ai_playtime_minutes: 900 }))).toEqual({
      ok: false, error: 'collection[0].ai_playtime is incomplete',
    });
  });

  it.each([
    { ai_playtime_minutes: null }, { ai_playtime_minutes: 0 }, { ai_playtime_minutes: 0.5 },
    { ai_playtime_minutes: 10_000_001 }, { ai_playtime_lower_minutes: null },
    { ai_playtime_lower_minutes: 0 }, { ai_playtime_lower_minutes: 0.5 }, { ai_playtime_lower_minutes: 901 },
    { ai_playtime_upper_minutes: null }, { ai_playtime_upper_minutes: 1.5 },
    { ai_playtime_upper_minutes: 899 }, { ai_playtime_upper_minutes: 10_000_001 },
    { ai_playtime_confidence: NaN }, { ai_playtime_confidence: -0.1 }, { ai_playtime_confidence: 1.1 },
    { ai_playtime_model: null }, { ai_playtime_model: ' ' }, { ai_playtime_model: 'x'.repeat(201) },
    { ai_playtime_rationale: 'x'.repeat(2001) }, { ai_playtime_generated_at: -1 },
  ])('rejects invalid AI fields: %j', (override) => {
    expect(decodeCollectionImportPayload(payload({ ...ai, ...override }))).toEqual({
      ok: false, error: 'collection[0].ai_playtime is invalid',
    });
  });

  it.each(['[]', 'null', '{broken', '{"title":"ai"}', '{"bad":"auto"}', '{"playtime":"bad"}', 'x'.repeat(2001)])('rejects invalid source preferences: %s', (source_pref) => {
    expect(decodeCollectionImportPayload(payload({ ...ai, source_pref }))).toEqual({
      ok: false, error: 'collection[0].source_pref is invalid',
    });
  });
});
