import { describe, expect, it } from 'vitest';
import { addToCollection, db, markReleaseOwned, upsertVn } from '@/lib/db';
import { getVndbLocalImportRepository } from '@/lib/db/repositories/vndb-local-import';

describe('SQLite VNDB local-import repository', () => {
  it('returns normalized collection and owned-edition snapshots', async () => {
    upsertVn({ id: 'v95001', title: 'Import title', languages: ['ja'] });
    upsertVn({ id: 'egs_95002', title: 'Synthetic title', languages: ['ja'] });
    addToCollection('v95001', { status: 'playing' });
    addToCollection('egs_95002', { status: 'planning' });
    markReleaseOwned('v95001', 'r95001', { edition_label: 'Box' });
    markReleaseOwned('egs_95002', 'synthetic:egs_95002');

    const snapshot = await getVndbLocalImportRepository().listSnapshot();

    expect(snapshot.vns).toEqual(expect.arrayContaining([
      { vn_id: 'v95001', title: 'Import title', status: 'playing' },
      { vn_id: 'egs_95002', title: 'Synthetic title', status: 'planning' },
    ]));
    expect(snapshot.releases).toEqual(expect.arrayContaining([
      { vn_id: 'v95001', release_id: 'r95001', vn_title: 'Import title', edition_label: 'Box' },
      { vn_id: 'egs_95002', release_id: 'synthetic:egs_95002', vn_title: 'Synthetic title', edition_label: null },
    ]));
  });

  it('does not expose a corrupt status as an import candidate', async () => {
    upsertVn({ id: 'v95003', title: 'Corrupt status title', languages: ['ja'] });
    addToCollection('v95003', { status: 'planning' });
    db.prepare('UPDATE collection SET status = ? WHERE vn_id = ?').run('invalid', 'v95003');
    const snapshot = await getVndbLocalImportRepository().listSnapshot();
    expect(snapshot.vns.some((row) => row.vn_id === 'v95003')).toBe(false);
  });
});
