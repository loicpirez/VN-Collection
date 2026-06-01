import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { readScrapedCharacterInfo } from '@/lib/scrape-character-instances';
import { readScrapedProducerInfo, scrapeProducersForVn } from '@/lib/scrape-producer-relations';
import { readScrapedTagDag, scrapeTagDagForVn } from '@/lib/scrape-tag-dag';
import { fetchUpcomingForCollection } from '@/lib/upcoming';

const NOW = Date.now();
const VN_ID = 'v990041';

function writeCacheRow(key: string, body: string): void {
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
  `).run(key, body, NOW, NOW + 60_000);
}

beforeEach(() => {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'scrape_%:99004%'`).run();
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
  db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(VN_ID, 'Fixture', NOW);
});

describe('scraped cache structure validation', () => {
  it('rejects malformed character payloads', () => {
    writeCacheRow('scrape_character:c990041', JSON.stringify({
      cid: 'c990041',
      instances: {},
      voiced_by: [],
    }));
    expect(readScrapedCharacterInfo('c990041')).toBeNull();
  });

  it('rejects malformed producer payloads', () => {
    writeCacheRow('scrape_producer:p990041', JSON.stringify({
      pid: 'p990041',
      relations: [{ relation: 'parent', id: 'not-a-producer', name: 'Fixture' }],
    }));
    expect(readScrapedProducerInfo('p990041')).toBeNull();
  });

  it('rejects malformed tag payloads', () => {
    writeCacheRow('scrape_tag:g990041', JSON.stringify({
      gid: 'g990041',
      parents: {},
      children: [],
    }));
    expect(readScrapedTagDag('g990041')).toBeNull();
  });

  it('treats parseable non-array producer credits as empty scrape input', async () => {
    db.prepare('UPDATE vn SET developers = ? WHERE id = ?').run('{"id":"p990041"}', VN_ID);
    await expect(scrapeProducersForVn(VN_ID, { force: true })).resolves.toEqual({
      scanned: 0,
      downloaded: 0,
    });
  });

  it('treats parseable non-array tags as empty scrape input', async () => {
    db.prepare('UPDATE vn SET tags = ? WHERE id = ?').run('{"id":"g990041"}', VN_ID);
    await expect(scrapeTagDagForVn(VN_ID, { force: true })).resolves.toEqual({
      scanned: 0,
      downloaded: 0,
    });
  });

  it('treats malformed upcoming developer credits as empty input', async () => {
    db.prepare('UPDATE vn SET developers = ? WHERE id = ?').run('{"id":"p990041"}', VN_ID);
    db.prepare('INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(VN_ID, 'planning', NOW, NOW);
    await expect(fetchUpcomingForCollection()).resolves.toEqual([]);
  });
});
