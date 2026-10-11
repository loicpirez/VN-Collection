import { afterEach, describe, expect, it } from 'vitest';
import { addToCollection, db } from '@/lib/db';
import { getAiPlaytimeRepository } from '@/lib/db/repositories/ai-playtime';
import { getCollectionPlaytimeSources } from '@/lib/db/repositories/collection-playtime';

const VN_ID = 'v90502';

afterEach(() => {
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
});

describe('collection duration enrichment', () => {
  it('returns no sources for an empty id window or a non-collection VN', async () => {
    await expect(getCollectionPlaytimeSources([])).resolves.toEqual(new Map());
    db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(VN_ID, 'Synthetic unowned', 1);
    await expect(getCollectionPlaytimeSources([VN_ID])).resolves.toEqual(new Map());
  });

  it('keeps zero personal time and absent external estimates distinct', async () => {
    db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(VN_ID, 'Synthetic empty', 1);
    addToCollection(VN_ID, { status: 'planning' });
    await expect(getCollectionPlaytimeSources([VN_ID])).resolves.toEqual(new Map([[VN_ID, {
      playtime_minutes: 0, egs_playtime_minutes: null, ai_playtime_minutes: null,
    }]]));
  });

  it('loads all local sources without exposing the full AI estimate', async () => {
    db.prepare('INSERT INTO vn (id, title, length_minutes, fetched_at) VALUES (?, ?, ?, ?)').run(VN_ID, 'Synthetic four', 600, 1);
    addToCollection(VN_ID, { status: 'playing', playtime_minutes: 600 });
    db.prepare('INSERT INTO egs_game (vn_id, playtime_median_minutes, fetched_at) VALUES (?, ?, ?)').run(VN_ID, 600, 1);
    await getAiPlaytimeRepository().set(VN_ID, {
      minutes: 2400, lower_minutes: 1800, upper_minutes: 3000,
      confidence: null, model: 'synthetic-test', rationale: null, generated_at: 1,
    });
    await expect(getCollectionPlaytimeSources([VN_ID, 'v90503'])).resolves.toEqual(new Map([[VN_ID, {
      playtime_minutes: 600, egs_playtime_minutes: 600, ai_playtime_minutes: 2400,
    }]]));
  });
});
