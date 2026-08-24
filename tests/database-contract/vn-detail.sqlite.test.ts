import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getVnDetailRepository } from '@/lib/db/repositories/vn-detail';
import {
  registerVnDetailRepositoryContract,
  VN_DETAIL_CONTRACT_FIXTURE,
} from './vn-detail.contract';

function reset(): void {
  const ids: string[] = [
    VN_DETAIL_CONTRACT_FIXTURE.firstVn,
    VN_DETAIL_CONTRACT_FIXTURE.screenshotVn,
    VN_DETAIL_CONTRACT_FIXTURE.neighborVn,
    VN_DETAIL_CONTRACT_FIXTURE.otherVn,
  ];
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM vn_tag_index WHERE vn_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM egs_game WHERE vn_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM vn WHERE id IN (${placeholders})`).run(...ids);
}

function seed(): void {
  reset();
  const fixture = VN_DETAIL_CONTRACT_FIXTURE;
  db.prepare(`
    INSERT INTO vn (id, title, screenshots, fetched_at) VALUES
      (?, 'Detail Contract One', '[]', 1),
      (?, 'Detail Contract Screenshot', '[{"dims":[1920,1080]}]', 1),
      (?, 'Detail Contract Neighbor', '[]', 1),
      (?, 'Detail Contract Other', '[]', 1)
  `).run(fixture.firstVn, fixture.screenshotVn, fixture.neighborVn, fixture.otherVn);
  db.prepare(`
    INSERT INTO collection (vn_id, status, source_pref, added_at, updated_at) VALUES
      (?, 'playing', '{"image":"egs","description":"custom"}', 1, 1),
      (?, 'planning', '{"invalid":"value"}', 1, 1),
      (?, 'completed', NULL, 1, 1),
      (?, 'completed', NULL, 1, 1)
  `).run(fixture.firstVn, fixture.screenshotVn, fixture.neighborVn, fixture.otherVn);
  db.prepare(`
    INSERT INTO egs_game (
      vn_id, egs_id, gamename, median, source, fetched_at
    ) VALUES (?, 994101, 'Contract EGS', 78, 'manual', 1)
  `).run(fixture.firstVn);
  db.prepare(`
    INSERT INTO vn_game_log (
      id, vn_id, note, logged_at, session_minutes, created_at, updated_at
    ) VALUES
      (?, ?, 'Before update', 100, 25, 100, 100),
      (?, ?, 'Other VN', 200, NULL, 200, 200)
  `).run(fixture.gameLogId, fixture.firstVn, fixture.otherGameLogId, fixture.otherVn);
  db.prepare(`
    INSERT INTO owned_release (vn_id, release_id, notes, added_at)
    VALUES (?, ?, NULL, 1)
  `).run(fixture.firstVn, fixture.releaseId);
  db.prepare(`
    INSERT INTO owned_release_aspect_override (
      vn_id, release_id, width, height, aspect_key, note, updated_at
    ) VALUES (?, ?, 800, 600, '4:3', NULL, 1)
  `).run(fixture.firstVn, fixture.releaseId);
  const tagInsert = db.prepare(`
    INSERT INTO vn_tag_index (vn_id, tag_id, tag_name, spoiler, category)
    VALUES (?, ?, ?, 0, ?)
  `);
  tagInsert.run(fixture.firstVn, 'g994101', 'Seed', 'cont');
  tagInsert.run(fixture.neighborVn, 'g994101', 'Seed', 'cont');
  tagInsert.run(fixture.neighborVn, 'g994102', 'Adjacent Alpha', 'cont');
  tagInsert.run(fixture.neighborVn, 'g994103', 'Adjacent Beta', 'tech');
  tagInsert.run(fixture.otherVn, 'g994101', 'Seed', 'cont');
  tagInsert.run(fixture.otherVn, 'g994102', 'Adjacent Alpha', 'cont');
}

registerVnDetailRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getVnDetailRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
