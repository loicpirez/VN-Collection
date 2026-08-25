import { afterEach, describe, expect, it } from 'vitest';
import {
  addToCollection,
  db,
  getCollectionItem,
  updateCollectionStatusIfCurrent,
  updateCollectionUserDataIfCurrent,
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

  it('atomically protects every VNDB-synchronized local field', () => {
    upsertVn({ id: VN_ID, title: 'Fixture' });
    addToCollection(VN_ID, {
      status: 'completed',
      user_rating: 90,
      started_date: '2025-01-01',
      finished_date: '2025-01-02',
      notes: 'local note',
    });
    expect(updateCollectionUserDataIfCurrent('v90802', { status: 'completed' }, { status: 'playing' })).toBe(false);
    expect(updateCollectionUserDataIfCurrent(VN_ID, { status: 'playing' }, { notes: 'remote' })).toBe(false);
    expect(updateCollectionUserDataIfCurrent(VN_ID, { user_rating: 80 }, { notes: 'remote' })).toBe(false);
    expect(updateCollectionUserDataIfCurrent(VN_ID, { started_date: null }, { notes: 'remote' })).toBe(false);
    expect(updateCollectionUserDataIfCurrent(VN_ID, { finished_date: null }, { notes: 'remote' })).toBe(false);
    expect(updateCollectionUserDataIfCurrent(VN_ID, { notes: 'changed' }, { notes: 'remote' })).toBe(false);
    expect(updateCollectionUserDataIfCurrent(VN_ID, {
      status: 'completed',
      user_rating: 90,
      started_date: '2025-01-01',
      finished_date: '2025-01-02',
      notes: 'local note',
    }, {
      status: 'playing',
      user_rating: 70,
      started_date: null,
      finished_date: null,
      notes: 'remote note',
    })).toBe(true);
    expect(getCollectionItem(VN_ID)).toMatchObject({
      status: 'playing',
      user_rating: 70,
      started_date: null,
      finished_date: null,
      notes: 'remote note',
    });
  });
});
