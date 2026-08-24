import { afterEach, describe, expect, it } from 'vitest';
import {
  addToCollection,
  db,
  getCollectionItem,
  updateCollectionStatusIfCurrent,
  upsertVn,
} from '@/lib/db';

const VN_ID = 'v90801';

describe('SQLite collection status compare-and-set', () => {
  afterEach(() => {
    db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
    db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
  });

  it('applies only the transition whose expected status still matches', () => {
    upsertVn({ id: VN_ID, title: 'Fixture' });
    addToCollection(VN_ID, { status: 'planning' });
    expect(updateCollectionStatusIfCurrent(VN_ID, 'planning', 'playing')).toBe(true);
    expect(getCollectionItem(VN_ID)?.status).toBe('playing');
    expect(updateCollectionStatusIfCurrent(VN_ID, 'planning', 'completed')).toBe(false);
    expect(updateCollectionStatusIfCurrent('v90802', 'planning', 'completed')).toBe(false);
    expect(getCollectionItem(VN_ID)?.status).toBe('playing');
  });
});
