/**
 * Coverage for the collection listing / filtering / sorting / projection
 * cluster in `src/lib/db.ts`, plus the EGS summary annotation, the
 * aggregate-stats + producer/publisher ranking caches, maintenance
 * diagnostics (duplicates / stale / anniversaries), the year-review /
 * ROI / histogram / heatmap reports, and the textual search.
 *
 * Hermetic: seeds only through the real exported writers (`upsertVn`,
 * `addToCollection`, `upsertEgsForVn`, `upsertProducer`, …) against the
 * per-worker temp SQLite from `tests/setup.ts`. No network, no real
 * VN/studio/staff names — synthetic ids (`v9xxxx`, `p9xxxx`) and
 * placeholder titles only.
 */
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  activityHeatmap,
  addManualActivity,
  addToCollection,
  bestRoi,
  countFinishedInYear,
  findDuplicates,
  findStaleVns,
  getAggregateStats,
  getCollectionItem,
  getEgsSummariesForVns,
  getStats,
  invalidateAggregateStats,
  invalidateProducerStats,
  listCollection,
  listProducerStats,
  listPublisherStats,
  ratingHistogram,
  searchTextual,
  setBanner,
  setCustomCover,
  setCustomDescription,
  setVnPublishers,
  tagsCompletedPerYear,
  todaysAnniversaries,
  updateCollection,
  upsertEgsForVn,
  upsertProducer,
  upsertVn,
  yearReview,
} from '@/lib/db';

// Force lib/db to bootstrap before opening a raw handle for cleanup.
listCollection({});
const db = new Database(process.env.DB_PATH!);

function wipe(): void {
  db.exec(`
    DELETE FROM owned_release;
    DELETE FROM egs_game;
    DELETE FROM vn_activity;
    DELETE FROM collection_place_index;
    DELETE FROM vn_publisher_index;
    DELETE FROM vn_developer_index;
    DELETE FROM vn_tag_index;
    DELETE FROM vn_language_index;
    DELETE FROM vn_platform_index;
    DELETE FROM vn_quote;
    DELETE FROM collection;
    DELETE FROM producer;
    DELETE FROM vn;
  `);
  invalidateAggregateStats();
  invalidateProducerStats();
}

beforeAll(wipe);
afterAll(() => db.close());
beforeEach(wipe);

/** Minimal EGS upsert helper — fills every required scalar with a placeholder. */
function seedEgs(vnId: string, over: Partial<Parameters<typeof upsertEgsForVn>[0]> = {}): void {
  upsertEgsForVn({
    vn_id: vnId,
    egs_id: 4242,
    gamename: 'placeholder-egs',
    gamename_furigana: null,
    brand_id: null,
    brand_name: null,
    model: null,
    description: null,
    image_url: null,
    okazu: 0,
    erogame: 0,
    raw_json: null,
    median: 80,
    average: 80,
    dispersion: null,
    count: 10,
    sellday: null,
    playtime_median_minutes: 600,
    source: 'search',
    ...over,
  });
}

describe('listCollection — filters', () => {
  it('filters by status and escapes LIKE wildcards in q', () => {
    upsertVn({ id: 'v90001', title: 'Alpha Placeholder' });
    upsertVn({ id: 'v90002', title: 'Beta_Underscore' });
    addToCollection('v90001', { status: 'completed' });
    addToCollection('v90002', { status: 'planning' });

    expect(listCollection({ status: 'completed' }).map((i) => i.id)).toEqual(['v90001']);
    // A literal underscore must match literally, not as a wildcard.
    expect(listCollection({ q: 'Beta_' }).map((i) => i.id)).toEqual(['v90002']);
    expect(listCollection({ q: 'BetaX' })).toHaveLength(0);
  });

  it('filters by edition, year range, dumped, favorite, has-notes/cover/banner', () => {
    upsertVn({ id: 'v90010', title: 'Year 2010', released: '2010-05-01' });
    upsertVn({ id: 'v90020', title: 'Year 2020', released: '2020-07-01' });
    setCustomCover('v90010', 'cc.jpg');
    setBanner('v90010', 'b.jpg');
    addToCollection('v90010', {
      status: 'completed',
      edition_type: 'limited',
      dumped: true,
      favorite: true,
      notes: 'a note',
    });
    addToCollection('v90020', { status: 'planning', edition_type: 'none' });

    expect(listCollection({ edition: 'limited' }).map((i) => i.id)).toEqual(['v90010']);
    expect(listCollection({ yearMin: 2015 }).map((i) => i.id)).toEqual(['v90020']);
    expect(listCollection({ yearMax: 2015 }).map((i) => i.id)).toEqual(['v90010']);
    expect(listCollection({ dumped: true }).map((i) => i.id)).toEqual(['v90010']);
    expect(listCollection({ isFavorite: true }).map((i) => i.id)).toEqual(['v90010']);
    expect(listCollection({ isFavorite: false }).map((i) => i.id)).toEqual(['v90020']);
    expect(listCollection({ hasNotes: true }).map((i) => i.id)).toEqual(['v90010']);
    expect(listCollection({ hasCustomCover: true }).map((i) => i.id)).toEqual(['v90010']);
    expect(listCollection({ hasBanner: true }).map((i) => i.id)).toEqual(['v90010']);
    expect(listCollection({ hasReleased: true }).map((i) => i.id).sort()).toEqual(['v90010', 'v90020']);
  });

  it('filters EGS-only vs VNDB-matched and matchEgs', () => {
    upsertVn({ id: 'v90030', title: 'Real VNDB' });
    db.prepare('INSERT INTO vn (id, title, egs_only, fetched_at) VALUES (?, ?, 1, ?)').run('egs_5001', 'Egs Only', Date.now());
    addToCollection('v90030', { status: 'planning' });
    addToCollection('egs_5001', { status: 'planning' });
    seedEgs('v90030');

    expect(listCollection({ onlyEgsOnly: true }).map((i) => i.id)).toEqual(['egs_5001']);
    expect(listCollection({ matchVndb: true }).map((i) => i.id)).toEqual(['v90030']);
    expect(listCollection({ matchEgs: true }).map((i) => i.id)).toEqual(['v90030']);
    expect(listCollection({ matchEgs: false }).map((i) => i.id)).toEqual(['egs_5001']);
  });

  it('filters by rating range and playtime range using the combined-source expressions', () => {
    upsertVn({ id: 'v90040', title: 'Low rated', rating: 40, length_minutes: 120 });
    upsertVn({ id: 'v90041', title: 'High rated', rating: 90, length_minutes: 1200 });
    addToCollection('v90040', { status: 'completed', playtime_minutes: 120 });
    addToCollection('v90041', { status: 'completed', playtime_minutes: 1200 });

    expect(listCollection({ ratingMin: 80 }).map((i) => i.id)).toEqual(['v90041']);
    expect(listCollection({ ratingMax: 50 }).map((i) => i.id)).toEqual(['v90040']);
    // 120 min ≈ 2h, 1200 min ≈ 20h.
    expect(listCollection({ playtimeMaxHours: 5 }).map((i) => i.id)).toEqual(['v90040']);
    expect(listCollection({ playtimeMinHours: 10 }).map((i) => i.id)).toEqual(['v90041']);
  });

  it('filters NSFW via image_sexual / ero tag and supports excludeNsfw', () => {
    upsertVn({ id: 'v90050', title: 'SFW title' });
    upsertVn({
      id: 'v90051',
      title: 'Adult title',
      image: { sexual: 2 },
      tags: [{ id: 'g700', name: 'some-ero-tag', rating: 3, spoiler: 0, category: 'ero' }],
    });
    addToCollection('v90050', { status: 'planning' });
    addToCollection('v90051', { status: 'planning' });

    expect(listCollection({ isNsfw: true }).map((i) => i.id)).toEqual(['v90051']);
    expect(listCollection({ excludeNsfw: true }).map((i) => i.id)).toEqual(['v90050']);
  });

  it('filters by nukige tag, fanDisc relation, reading queue, and list membership', () => {
    upsertVn({
      id: 'v90060',
      title: 'Nukige fixture',
      tags: [{ id: 'g800', name: 'nukige', rating: 3, spoiler: 0, category: 'cont' }],
    });
    upsertVn({
      id: 'v90061',
      title: 'Fan disc fixture',
      relations: [{ id: 'v90060', title: 'orig', relation: 'orig', relation_official: true }],
    });
    addToCollection('v90060', { status: 'planning' });
    addToCollection('v90061', { status: 'planning' });
    db.prepare('INSERT INTO reading_queue (vn_id, position, added_at) VALUES (?, 1, ?)').run('v90060', Date.now());
    db.prepare("INSERT INTO user_list (name, slug, pinned, created_at, updated_at) VALUES ('L','l',0,?,?)").run(Date.now(), Date.now());
    const listId = (db.prepare('SELECT id FROM user_list LIMIT 1').get() as { id: number }).id;
    db.prepare('INSERT INTO user_list_vn (list_id, vn_id, order_index, added_at) VALUES (?, ?, 0, ?)').run(listId, 'v90061', Date.now());

    expect(listCollection({ isNukige: true }).map((i) => i.id)).toEqual(['v90060']);
    expect(listCollection({ fanDisc: true }).map((i) => i.id)).toEqual(['v90061']);
    expect(listCollection({ inReadingQueue: true }).map((i) => i.id)).toEqual(['v90060']);
    expect(listCollection({ inList: true }).map((i) => i.id)).toEqual(['v90061']);
  });

  it('vnIds restricts the result and an empty vnIds array short-circuits to []', () => {
    upsertVn({ id: 'v90070', title: 'A' });
    upsertVn({ id: 'v90071', title: 'B' });
    addToCollection('v90070', { status: 'planning' });
    addToCollection('v90071', { status: 'planning' });
    expect(listCollection({ vnIds: ['v90071'] }).map((i) => i.id)).toEqual(['v90071']);
    expect(listCollection({ vnIds: [] })).toEqual([]);
  });

  it('filters by aspect (single + multi + unknown bucket)', () => {
    upsertVn({ id: 'v90080', title: 'Widescreen' });
    upsertVn({ id: 'v90081', title: 'No signal' });
    addToCollection('v90080', { status: 'planning' });
    addToCollection('v90081', { status: 'planning' });
    db.prepare(
      "INSERT INTO release_resolution_cache (release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at) VALUES ('r1','v90080',1920,1080,'1920x1080','16:9',?)",
    ).run(Date.now());

    expect(listCollection({ aspect: '16:9' }).map((i) => i.id)).toEqual(['v90080']);
    expect(listCollection({ aspects: ['16:9'] }).map((i) => i.id)).toEqual(['v90080']);
    expect(listCollection({ aspect: 'unknown' }).map((i) => i.id)).toEqual(['v90081']);
    // Each returned item carries its derived aspect_keys.
    expect(getCollectionItem('v90080')).toBeTruthy();
    expect(listCollection({ vnIds: ['v90080'] })[0].aspect_keys).toEqual(['16:9']);
  });
});

describe('listCollection — sorting + annotation', () => {
  it('sorts by title, rating, egs_rating, combined_rating, and custom order', () => {
    upsertVn({ id: 'v90090', title: 'Zeta', rating: 50 });
    upsertVn({ id: 'v90091', title: 'Alpha', rating: 90 });
    addToCollection('v90090', { status: 'planning' });
    addToCollection('v90091', { status: 'planning' });
    seedEgs('v90090', { median: 95 });
    seedEgs('v90091', { median: 10 });

    expect(listCollection({ sort: 'title', order: 'asc' }).map((i) => i.id)).toEqual(['v90091', 'v90090']);
    expect(listCollection({ sort: 'rating', order: 'desc' }).map((i) => i.id)).toEqual(['v90091', 'v90090']);
    expect(listCollection({ sort: 'egs_rating', order: 'desc' }).map((i) => i.id)).toEqual(['v90090', 'v90091']);
    // combined: v90090=(50+95)/2=72.5, v90091=(90+10)/2=50 → v90090 first.
    expect(listCollection({ sort: 'combined_rating', order: 'desc' }).map((i) => i.id)).toEqual(['v90090', 'v90091']);

    db.prepare('UPDATE collection SET custom_order = 2 WHERE vn_id = ?').run('v90090');
    db.prepare('UPDATE collection SET custom_order = 1 WHERE vn_id = ?').run('v90091');
    expect(listCollection({ sort: 'custom', order: 'asc' }).map((i) => i.id)).toEqual(['v90091', 'v90090']);
  });

  it('sorts by combined / egs playtime', () => {
    upsertVn({ id: 'v90100', title: 'Short', length_minutes: 60 });
    upsertVn({ id: 'v90101', title: 'Long', length_minutes: 6000 });
    addToCollection('v90100', { status: 'completed', playtime_minutes: 60 });
    addToCollection('v90101', { status: 'completed', playtime_minutes: 6000 });
    seedEgs('v90100', { playtime_median_minutes: 30 });
    seedEgs('v90101', { playtime_median_minutes: 9000 });

    expect(listCollection({ sort: 'egs_playtime', order: 'desc' }).map((i) => i.id)).toEqual(['v90101', 'v90100']);
    expect(listCollection({ sort: 'combined_playtime', order: 'desc' }).map((i) => i.id)).toEqual(['v90101', 'v90100']);
  });

  it('annotates each row with its EGS summary block', () => {
    upsertVn({ id: 'v90110', title: 'With egs' });
    addToCollection('v90110', { status: 'planning' });
    seedEgs('v90110', { median: 77, erogame: 1, okazu: 1 });
    const item = listCollection({ vnIds: ['v90110'] })[0];
    expect(item.egs).toMatchObject({ egs_id: 4242, median: 77, erogame: true, okazu: true, source: 'search' });
  });

  it('enforces limit + offset after sorting', () => {
    for (const n of [1, 2, 3]) {
      upsertVn({ id: `v9012${n}`, title: `Row ${n}` });
      addToCollection(`v9012${n}`, { status: 'planning' });
    }
    expect(listCollection({ sort: 'title', order: 'asc', limit: 1 }).map((i) => i.id)).toEqual(['v90121']);
    expect(listCollection({ sort: 'title', order: 'asc', limit: 1, offset: 1 }).map((i) => i.id)).toEqual(['v90122']);
  });
});

describe('getEgsSummariesForVns', () => {
  it('returns an empty map for no ids and a populated map otherwise', () => {
    expect(getEgsSummariesForVns([]).size).toBe(0);
    upsertVn({ id: 'v90130', title: 'X' });
    seedEgs('v90130', { median: 42 });
    const map = getEgsSummariesForVns(['v90130', 'v99999']);
    expect(map.get('v90130')?.median).toBe(42);
    expect(map.has('v99999')).toBe(false);
  });

  it('chunks correctly over more than 500 ids', () => {
    upsertVn({ id: 'v90140', title: 'Chunk' });
    seedEgs('v90140', { median: 11 });
    const ids = [...Array.from({ length: 600 }, (_, i) => `v8${i}`), 'v90140'];
    const map = getEgsSummariesForVns(ids);
    expect(map.get('v90140')?.median).toBe(11);
  });
});

describe('producer / publisher stats + TTL cache', () => {
  it('ranks developers and publishers by VN count and falls back to the JSON name', () => {
    upsertProducer({ id: 'p90001', name: 'Studio One' });
    upsertVn({ id: 'v90200', title: 'Dev A', developers: [{ id: 'p90001', name: 'Studio One' }] });
    upsertVn({ id: 'v90201', title: 'Dev B', developers: [{ id: 'p90001', name: 'Studio One' }] });
    // p90002 has no producer row — name resolves from vn.developers JSON.
    upsertVn({ id: 'v90202', title: 'Dev C', developers: [{ id: 'p90002', name: 'Studio Two' }] });
    setVnPublishers('v90200', [{ id: 'p90003', name: 'Publisher X' }]);
    addToCollection('v90200', { status: 'completed', user_rating: 80 });
    addToCollection('v90201', { status: 'completed', user_rating: 90 });
    addToCollection('v90202', { status: 'planning' });

    const devs = listProducerStats();
    const one = devs.find((d) => d.id === 'p90001');
    expect(one?.vn_count).toBe(2);
    expect(one?.name).toBe('Studio One');
    expect(devs.find((d) => d.id === 'p90002')?.name).toBe('Studio Two');

    const pubs = listPublisherStats();
    expect(pubs.find((p) => p.id === 'p90003')?.vn_count).toBe(1);
  });

  it('serves a cached snapshot until invalidated', () => {
    upsertProducer({ id: 'p90010', name: 'Cached studio' });
    upsertVn({ id: 'v90210', title: 'Cached', developers: [{ id: 'p90010', name: 'Cached studio' }] });
    addToCollection('v90210', { status: 'planning' });
    const first = listProducerStats();
    expect(first.find((d) => d.id === 'p90010')?.vn_count).toBe(1);

    // Add another credited VN directly (bypassing the invalidating writer).
    upsertVn({ id: 'v90211', title: 'Cached 2', developers: [{ id: 'p90010', name: 'Cached studio' }] });
    db.prepare('INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES (?, ?, ?, ?)').run('v90211', 'planning', Date.now(), Date.now());
    // Cache still holds the old count.
    expect(listProducerStats().find((d) => d.id === 'p90010')?.vn_count).toBe(1);
    invalidateProducerStats();
    expect(listProducerStats().find((d) => d.id === 'p90010')?.vn_count).toBe(2);
  });
});

describe('aggregate stats + getStats', () => {
  it('getStats returns total + per-status counts + summed playtime', () => {
    upsertVn({ id: 'v90300', title: 'A' });
    upsertVn({ id: 'v90301', title: 'B' });
    addToCollection('v90300', { status: 'completed', playtime_minutes: 100 });
    addToCollection('v90301', { status: 'planning', playtime_minutes: 50 });
    const stats = getStats();
    expect(stats.total).toBe(2);
    expect(stats.playtime_minutes).toBe(150);
    expect(stats.byStatus.find((s) => s.status === 'completed')?.n).toBe(1);
  });

  it('getAggregateStats computes distributions and is invalidated by writes', () => {
    upsertVn({ id: 'v90310', title: 'Jp', released: '2019-03-10', languages: ['ja'], platforms: ['win'], tags: [{ id: 'g1', name: 'romance', rating: 3, spoiler: 0, category: 'cont' }] });
    addToCollection('v90310', { status: 'completed', user_rating: 85, finished_date: '2019-04-01', playtime_minutes: 600 });
    seedEgs('v90310', { median: 80, playtime_median_minutes: 500 });

    const agg = getAggregateStats();
    // user_rating 85 → bucket index floor(85/10)-1 = 7 → bucket 8.
    expect(agg.ratingDistribution.find((b) => b.bucket === 8)?.count).toBe(1);
    expect(agg.byLanguage.find((l) => l.lang === 'ja')?.count).toBe(1);
    expect(agg.byPlatform.find((p) => p.platform === 'win')?.count).toBe(1);
    expect(agg.byYear.find((y) => y.year === '2019')?.count).toBe(1);
    expect(agg.topTags.find((t) => t.id === 'g1')?.count).toBe(1);
    expect(agg.egs.matched).toBe(1);
    expect(agg.finishedByMonth.find((m) => m.month === '2019-04')?.count).toBe(1);

    // A new completed VN through the invalidating writer must be reflected.
    upsertVn({ id: 'v90311', title: 'En', languages: ['en'] });
    addToCollection('v90311', { status: 'completed', user_rating: 30 });
    expect(getAggregateStats().byLanguage.find((l) => l.lang === 'en')?.count).toBe(1);
  });
});

describe('year-review / ROI / histogram / heatmap / textual search', () => {
  it('countFinishedInYear + yearReview summarize a finished cohort', () => {
    upsertVn({
      id: 'v90400',
      title: 'Finished 2021',
      tags: [{ id: 'g10', name: 'drama', rating: 3, spoiler: 0, category: 'cont' }],
    });
    addToCollection('v90400', { status: 'completed', user_rating: 88, finished_date: '2021-06-15', playtime_minutes: 1200 });
    expect(countFinishedInYear(2021)).toBe(1);
    const review = yearReview(2021);
    expect(review.completed).toBe(1);
    expect(review.hours).toBe(20);
    expect(review.avgUserRating).toBe(88);
    expect(review.topTags.find((t) => t.id === 'g10')?.count).toBe(1);
    expect(review.best[0]?.id).toBe('v90400');
  });

  it('tagsCompletedPerYear groups top tags by finish year', () => {
    upsertVn({ id: 'v90410', title: 'Tagged', tags: [{ id: 'g20', name: 'mystery', rating: 3, spoiler: 0, category: 'cont' }] });
    addToCollection('v90410', { status: 'completed', finished_date: '2022-01-01' });
    const rows = tagsCompletedPerYear(6);
    expect(rows.some((r) => r.year === 2022 && r.tag === 'mystery')).toBe(true);
  });

  it('bestRoi ranks rating-per-hour and ratingHistogram buckets pair mine vs vndb', () => {
    upsertVn({ id: 'v90420', title: 'Quick win', rating: 70 });
    addToCollection('v90420', { status: 'completed', user_rating: 90, playtime_minutes: 60 });
    expect(bestRoi(5)[0]?.id).toBe('v90420');

    const hist = ratingHistogram();
    expect(hist).toHaveLength(10);
    expect(hist.find((b) => b.bucket === 90)?.mine).toBe(1);
    expect(hist.find((b) => b.bucket === 70)?.vndb).toBe(1);
  });

  it('activityHeatmap counts vn_activity rows per day in a year', () => {
    upsertVn({ id: 'v90430', title: 'Heat' });
    addToCollection('v90430', { status: 'planning' });
    const ts = new Date('2023-08-08T12:00:00Z').getTime();
    addManualActivity('v90430', 'logged something', ts);
    const heat = activityHeatmap(2023);
    expect(heat.find((d) => d.day === '2023-08-08')?.count).toBe(1);
    // A different year sees nothing.
    expect(activityHeatmap(2099)).toEqual([]);
  });

  it('searchTextual finds notes, custom descriptions, and quotes', () => {
    upsertVn({ id: 'v90440', title: 'Searchable' });
    addToCollection('v90440', { status: 'planning', notes: 'a unique needle here' });
    setCustomDescription('v90440', 'custom needle synopsis');
    db.prepare(
      'INSERT INTO vn_quote (quote_id, vn_id, quote, score, fetched_at) VALUES (?, ?, ?, ?, ?)',
    ).run('q1', 'v90440', 'a quoted needle line', 5, Date.now());

    const sources = searchTextual('needle').map((h) => h.source).sort();
    expect(sources).toEqual(['custom_description', 'notes', 'quote']);
    // Too-short queries return nothing.
    expect(searchTextual('n')).toEqual([]);
  });

  it('findDuplicates groups VNs by normalized title; findStaleVns surfaces old / cover-less rows', () => {
    upsertVn({ id: 'v90450', title: 'Same Title!' });
    upsertVn({ id: 'v90451', title: 'same title' });
    upsertVn({ id: 'v90452', title: 'Unique Solo Title' });
    const dupes = findDuplicates();
    const group = dupes.find((g) => g.ids.includes('v90450'));
    expect(group?.ids.sort()).toEqual(['v90450', 'v90451']);
    expect(dupes.find((g) => g.ids.includes('v90452'))).toBeUndefined();

    // Force one row's fetched_at far into the past and strip every cover.
    db.prepare('UPDATE vn SET fetched_at = 0, image_url = NULL, local_image = NULL, custom_cover = NULL WHERE id = ?').run('v90452');
    const stale = findStaleVns();
    expect(stale.find((s) => s.id === 'v90452')).toMatchObject({ has_cover: false });
  });

  it('todaysAnniversaries lists VNs released on the same calendar day', () => {
    upsertVn({ id: 'v90460', title: 'Anniversary', released: '2015-03-21' });
    addToCollection('v90460', { status: 'planning' });
    const anchor = new Date(2024, 2, 21); // March 21, local time.
    const anns = todaysAnniversaries(anchor);
    expect(anns.find((a) => a.id === 'v90460')?.years).toBe(9);
    // A non-matching day returns nothing for it.
    expect(todaysAnniversaries(new Date(2024, 0, 1)).find((a) => a.id === 'v90460')).toBeUndefined();
  });
});

describe('updateCollection writes per-field activity', () => {
  it('logs status / rating / playtime / favorite transitions', () => {
    upsertVn({ id: 'v90500', title: 'Tracked' });
    addToCollection('v90500', { status: 'planning', playtime_minutes: 0 });
    updateCollection('v90500', { status: 'completed', user_rating: 80, playtime_minutes: 120, favorite: true });
    const kinds = (db.prepare('SELECT kind FROM vn_activity WHERE vn_id = ?').all('v90500') as { kind: string }[]).map((r) => r.kind).sort();
    expect(kinds).toEqual(['favorite', 'playtime', 'rating', 'status']);
  });
});
