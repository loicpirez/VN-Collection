import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getPeopleRepository } from '@/lib/db/repositories/people';
import {
  PEOPLE_CONTRACT_IDS,
  peopleContractCharacterProfile,
  registerPeopleRepositoryContract,
} from './people.contract';

function reset(): void {
  db.exec(`
    DELETE FROM character_image WHERE char_id LIKE '%99210%';
    DELETE FROM vndb_cache WHERE cache_key LIKE 'char_full:c99210%';
    DELETE FROM character_vn_index WHERE character_id LIKE 'c99210%';
    DELETE FROM vn_va_credit WHERE vn_id LIKE 'v99210%';
    DELETE FROM vn_staff_credit WHERE vn_id LIKE 'v99210%';
    DELETE FROM collection WHERE vn_id LIKE 'v99210%';
    DELETE FROM vn WHERE id LIKE 'v99210%';
  `);
}

function seed(): void {
  reset();
  const ids = PEOPLE_CONTRACT_IDS;
  db.prepare(`
    INSERT INTO vn (id, title, released, fetched_at) VALUES
      (?, 'Alpha People VN', '2020-01-01', 1),
      (?, 'Beta People VN', '2022-01-01', 1)
  `).run(ids.ownedVn, ids.otherVn);
  db.prepare(`
    INSERT INTO collection (vn_id, status, added_at, updated_at)
    VALUES (?, 'completed', 1, 1)
  `).run(ids.ownedVn);
  db.prepare(`
    INSERT INTO vn_staff_credit (vn_id, sid, eid, role, note, name, original, lang) VALUES
      (?, ?, 1, 'scenario', 'Lead', 'Shared Staff', 'Staff Original', 'ja'),
      (?, ?, 2, 'art', NULL, 'Shared Staff', 'Staff Original', 'ja'),
      (?, ?, NULL, 'music', NULL, 'Shared Staff', 'Staff Original', 'ja'),
      (?, ?, NULL, 'scenario', NULL, 'Shared Staff', NULL, 'ja')
  `).run(
    ids.ownedVn, ids.primaryStaff,
    ids.ownedVn, ids.primaryStaff,
    ids.otherVn, ids.primaryStaff,
    ids.ownedVn, ids.siblingStaff,
  );
  db.prepare(`
    INSERT INTO vn_va_credit (
      vn_id, sid, c_id, c_name, c_original, c_image_url,
      va_name, va_original, va_lang, note
    ) VALUES
      (?, ?, ?, 'Alpha Character', 'Shared Character', 'https://example.test/alpha.jpg',
        'Shared Staff', 'Staff Original', 'ja', 'Lead voice'),
      (?, ?, 'c992103', 'Other Character', NULL, NULL,
        'Shared Staff', 'Staff Original', 'ja', NULL),
      (?, ?, ?, 'Sibling Character', 'Shared Character', NULL,
        'Sibling Voice', NULL, 'ja', NULL)
  `).run(
    ids.ownedVn, ids.primaryStaff, ids.primaryCharacter,
    ids.otherVn, ids.primaryStaff,
    ids.ownedVn, ids.siblingStaff, ids.siblingCharacter,
  );
  db.prepare(`
    INSERT INTO character_image (char_id, url, local_path, fetched_at)
    VALUES (?, 'https://example.test/alpha.jpg', 'character/alpha.jpg', 1)
  `).run(ids.primaryCharacter);
  db.prepare(`
    INSERT INTO character_vn_index (character_id, vn_id) VALUES (?, ?)
  `).run(ids.primaryCharacter, ids.ownedVn);
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at)
    VALUES (?, ?, 1, 9999999999999)
  `).run(
    `char_full:${ids.primaryCharacter}`,
    JSON.stringify({ profile: peopleContractCharacterProfile() }),
  );
}

registerPeopleRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getPeopleRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
