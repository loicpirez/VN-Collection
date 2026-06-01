import { beforeEach, describe, expect, it } from 'vitest';
import { addToCollection, db, updateCollection } from '@/lib/db';
import { downloadFullProducerForVn } from '@/lib/producer-full';
import { downloadFullRelationsForVn } from '@/lib/relations-full';
import { recommendVns } from '@/lib/recommend';

const VN_ID = 'v990010';

beforeEach(() => {
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
  db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(VN_ID, 'Fixture', Date.now());
});

describe('persisted JSON list boundaries', () => {
  it('treats parseable non-array producer credits as empty input', async () => {
    db.prepare('UPDATE vn SET developers = ? WHERE id = ?').run('{"id":"p990010"}', VN_ID);
    await expect(downloadFullProducerForVn(VN_ID, { force: true })).resolves.toEqual({
      scanned: 0,
      downloaded: 0,
    });
  });

  it('treats parseable non-array relation lists as empty input', async () => {
    db.prepare('UPDATE vn SET raw = ? WHERE id = ?').run('{"relations":{"id":"v990011"}}', VN_ID);
    await expect(downloadFullRelationsForVn(VN_ID, { force: true })).resolves.toEqual({
      scanned: 0,
      downloaded: 0,
    });
  });

  it('treats parseable non-array recommendation tags as empty input', async () => {
    db.prepare('UPDATE vn SET tags = ? WHERE id = ?').run('{"id":"g990010","name":"Fixture"}', VN_ID);
    addToCollection(VN_ID, {});
    updateCollection(VN_ID, { user_rating: 90 });
    await expect(recommendVns({ useWishlist: false })).resolves.toMatchObject({
      seeds: [],
      results: [],
    });
  });
});
