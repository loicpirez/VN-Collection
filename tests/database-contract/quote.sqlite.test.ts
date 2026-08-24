import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getQuoteRepository } from '@/lib/db/repositories/quote';
import { QUOTE_CONTRACT_IDS, registerQuoteRepositoryContract } from './quote.contract';

function reset(): void {
  const ids = QUOTE_CONTRACT_IDS;
  db.prepare('DELETE FROM character_image WHERE char_id = ?').run('c994301');
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(ids.firstVn, ids.outsideCollectionVn);
}

function seed(): void {
  reset();
  const ids = QUOTE_CONTRACT_IDS;
  db.prepare(`
    INSERT INTO vn (id, title, image_url, local_image, local_image_thumb, fetched_at) VALUES
      (?, 'Quote Contract One', 'https://example.test/v994301.jpg', 'covers/v994301.jpg', 'covers/v994301-thumb.jpg', 1),
      (?, 'Quote Contract Outside', NULL, NULL, NULL, 1)
  `).run(ids.firstVn, ids.outsideCollectionVn);
  db.prepare(`
    INSERT INTO collection (vn_id, status, added_at, updated_at)
    VALUES (?, 'completed', 1, 1)
  `).run(ids.firstVn);
  db.prepare(`
    INSERT INTO character_image (char_id, url, local_path, fetched_at)
    VALUES ('c994301', 'https://example.test/c994301.jpg', 'characters/c994301.jpg', 1)
  `).run();
  db.prepare(`
    INSERT INTO vn_quote (
      quote_id, vn_id, quote, score, character_id, character_name, fetched_at
    ) VALUES
      (?, ?, 'A 100%_real contract quote', 10, 'c994301', 'Contract Heroine', 1),
      (?, ?, 'Outside collection', 99, NULL, NULL, 1)
  `).run(ids.firstQuote, ids.firstVn, ids.secondQuote, ids.outsideCollectionVn);
}

registerQuoteRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getQuoteRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
