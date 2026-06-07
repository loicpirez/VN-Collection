/**
 * Coverage for the user-list, reading-queue, reading-goal, saved-filter,
 * series, Steam-link, game-log, activity, batch-name-lookup, and manual
 * EGS<->VNDB link clusters in `src/lib/db.ts`.
 *
 * Hermetic: every fixture goes through a real exported writer against the
 * per-worker temp SQLite from `tests/setup.ts`. No network. Synthetic ids.
 */
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addGameLogEntry,
  addManualActivity,
  addToCollection,
  addToReadingQueue,
  addVnToList,
  addVnToSeries,
  batchGetCharNames,
  batchGetProducerNames,
  batchGetStaffNames,
  batchGetVnTitles,
  clearEgsVnLink,
  clearVnEgsLink,
  countListMembershipsByVn,
  createSavedFilter,
  createSeries,
  createUserList,
  deleteActivityForVn,
  deleteGameLogEntry,
  deleteSavedFilter,
  deleteSeries,
  deleteSteamLink,
  deleteUserList,
  getEgsVnLink,
  getReadingGoal,
  getReadingQueueVnIds,
  getSeries,
  getSteamLinkByAppid,
  getSteamLinkForVn,
  getUserList,
  getUserListBySlug,
  getVnEgsLink,
  listAllEgsVnLinks,
  listAllListMemberships,
  listActivityForVn,
  listGameLogForVn,
  listListsForVn,
  listReadingQueue,
  listRecentActivity,
  listSavedFilters,
  listSeries,
  listSeriesForVn,
  listSteamLinks,
  listUserListItems,
  listUserLists,
  markSteamSynced,
  removeFromReadingQueue,
  removeVnFromList,
  reorderListItems,
  reorderReadingQueue,
  reorderSavedFilters,
  setEgsVnLink,
  setReadingGoal,
  setSteamLink,
  setVnEgsLink,
  updateGameLogEntry,
  updateSeries,
  updateUserList,
  upsertVn,
} from '@/lib/db';

listUserLists();
const db = new Database(process.env.DB_PATH!);

function wipe(): void {
  db.exec(`
    DELETE FROM user_list_vn;
    DELETE FROM user_list;
    DELETE FROM reading_queue;
    DELETE FROM reading_goal;
    DELETE FROM saved_filter;
    DELETE FROM series_vn;
    DELETE FROM series;
    DELETE FROM steam_link;
    DELETE FROM vn_game_log;
    DELETE FROM vn_activity;
    DELETE FROM vn_egs_link;
    DELETE FROM egs_vn_link;
    DELETE FROM vn_staff_credit;
    DELETE FROM vn_va_credit;
    DELETE FROM collection;
    DELETE FROM producer;
    DELETE FROM vn;
  `);
}

beforeAll(wipe);
afterAll(() => db.close());
beforeEach(wipe);

describe('user lists', () => {
  it('creates with a unique slug, reads by id + slug, lists with counts, and updates', () => {
    const a = createUserList({ name: 'My List', description: 'd', color: '#fff', icon: 'star' });
    const b = createUserList({ name: 'My List' }); // same name → slug collision handled.
    expect(a.slug).toBe('my-list');
    expect(b.slug).toBe('my-list-2');
    expect(getUserList(a.id)?.name).toBe('My List');
    expect(getUserListBySlug('my-list')?.id).toBe(a.id);
    expect(getUserList(99999)).toBeNull();

    addVnToList(a.id, 'v90001');
    const lists = listUserLists();
    expect(lists.find((l) => l.id === a.id)?.vn_count).toBe(1);

    const updated = updateUserList(a.id, { name: 'Renamed List', pinned: true, description: null });
    expect(updated?.name).toBe('Renamed List');
    expect(updated?.slug).toBe('renamed-list');
    expect(updated?.pinned).toBe(1);
    expect(updateUserList(99999, { name: 'nope' })).toBeNull();
  });

  it('validates names and keeps slugs stable for equivalent renames', () => {
    expect(() => createUserList({ name: '   ' })).toThrow(/name required/);
    const punctuation = createUserList({ name: '!!!', color: '#123456', icon: 'bookmark' });
    const duplicate = createUserList({ name: '!!!' });
    expect(punctuation.slug).toBe('list');
    expect(duplicate.slug).toBe('list-2');
    expect(getUserListBySlug('missing-list')).toBeNull();

    const slugStable = createUserList({ name: 'Case Name' });
    const renamed = updateUserList(slugStable.id, {
      name: 'CASE NAME',
      color: '#abcdef',
      icon: null,
      pinned: false,
    });
    expect(renamed).toMatchObject({
      name: 'CASE NAME',
      slug: 'case-name',
      color: '#abcdef',
      icon: null,
      pinned: 0,
    });
    expect(() => updateUserList(slugStable.id, { name: '  ' })).toThrow(/name required/);
  });

  it('adds / lists / removes / reorders members and tracks memberships per VN', () => {
    const list = createUserList({ name: 'Members' });
    expect(addVnToList(99999, 'v90001')).toBeNull();
    addVnToList(list.id, 'v90001');
    addVnToList(list.id, 'v90002');
    addVnToList(list.id, 'v90003');

    expect(listUserListItems(list.id).map((i) => i.vn_id)).toEqual(['v90001', 'v90002', 'v90003']);
    expect(listListsForVn('v90001').map((l) => l.id)).toEqual([list.id]);
    expect(listAllListMemberships()['v90002']?.[0]?.id).toBe(list.id);
    expect(countListMembershipsByVn().get('v90001')).toBe(1);

    reorderListItems(list.id, ['v90003', 'v90001', 'v90002']);
    expect(listUserListItems(list.id).map((i) => i.vn_id)).toEqual(['v90003', 'v90001', 'v90002']);

    expect(removeVnFromList(list.id, 'v90003')).toBe(true);
    expect(removeVnFromList(list.id, 'v90003')).toBe(false);
    expect(listUserListItems(list.id)).toHaveLength(2);
  });

  it('deletes a list and cascades its members', () => {
    const list = createUserList({ name: 'Doomed' });
    addVnToList(list.id, 'v90001');
    expect(deleteUserList(list.id)).toBe(true);
    expect(deleteUserList(list.id)).toBe(false);
    expect(getUserList(list.id)).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM user_list_vn WHERE list_id = ?').get(list.id)).toEqual({ n: 0 });
  });

  it('re-adding a VN updates the note without duplicating the row', () => {
    const list = createUserList({ name: 'Notes' });
    addVnToList(list.id, 'v90001', 'first note');
    addVnToList(list.id, 'v90001', 'second note');
    const items = listUserListItems(list.id);
    expect(items).toHaveLength(1);
    expect(items[0].note).toBe('second note');
  });
});

describe('reading queue + goal', () => {
  it('appends idempotently, lists in order, removes, and reorders', () => {
    upsertVn({ id: 'v90001', title: 'Queued A' });
    upsertVn({ id: 'v90002', title: 'Queued B' });
    const first = addToReadingQueue('V90001'); // upper-case normalises to lower.
    expect(first.vn_id).toBe('v90001');
    addToReadingQueue('v90002');
    // Re-adding keeps the existing slot (no duplicate / no reorder).
    addToReadingQueue('v90001');
    expect(listReadingQueue().map((r) => r.vn_id)).toEqual(['v90001', 'v90002']);
    expect(getReadingQueueVnIds().has('v90001')).toBe(true);

    reorderReadingQueue(['v90002', 'v90001']);
    expect(listReadingQueue().map((r) => r.vn_id)).toEqual(['v90002', 'v90001']);

    expect(removeFromReadingQueue('v90002')).toBe(true);
    expect(removeFromReadingQueue('v90002')).toBe(false);
    expect(listReadingQueue().map((r) => r.vn_id)).toEqual(['v90001']);
  });

  it('upserts a reading goal per year and clamps the target', () => {
    expect(getReadingGoal(2030)).toBeNull();
    expect(setReadingGoal(2030, 12).target).toBe(12);
    expect(setReadingGoal(2030, 5).target).toBe(5);
    expect(setReadingGoal(2030, 99999).target).toBe(1000); // clamped upper bound.
    expect(getReadingGoal(2030)?.target).toBe(1000);
  });
});

describe('saved filters', () => {
  it('creates with incrementing positions, lists in order, reorders, and deletes', () => {
    const a = createSavedFilter('Filter A', 'status=completed');
    const b = createSavedFilter('Filter B', 'tag=g1');
    expect(a.position).toBe(1);
    expect(b.position).toBe(2);
    expect(listSavedFilters().map((f) => f.id)).toEqual([a.id, b.id]);

    reorderSavedFilters([b.id, a.id]);
    expect(listSavedFilters().map((f) => f.id)).toEqual([b.id, a.id]);

    expect(deleteSavedFilter(a.id)).toBe(true);
    expect(deleteSavedFilter(a.id)).toBe(false);
    expect(listSavedFilters().map((f) => f.id)).toEqual([b.id]);
  });
});

describe('series', () => {
  it('creates, lists, links VNs in order, reads with members, updates, and deletes', () => {
    upsertVn({ id: 'v90001', title: 'Entry One' });
    upsertVn({ id: 'v90002', title: 'Entry Two' });
    const series = createSeries('Saga', 'first run');
    expect(listSeries().map((s) => s.id)).toEqual([series.id]);

    addVnToSeries(series.id, 'v90002', 1);
    addVnToSeries(series.id, 'v90001', 0);
    const withVns = getSeries(series.id);
    expect(withVns?.vns.map((v) => v.id)).toEqual(['v90001', 'v90002']);
    expect(listSeriesForVn('v90001').map((s) => s.id)).toEqual([series.id]);

    const updated = updateSeries(series.id, { name: 'Saga Renamed', description: null });
    expect(updated?.name).toBe('Saga Renamed');
    // An empty patch returns the row unchanged.
    expect(updateSeries(series.id, {})?.name).toBe('Saga Renamed');

    deleteSeries(series.id);
    expect(getSeries(series.id)).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM series_vn WHERE series_id = ?').get(series.id)).toEqual({ n: 0 });
  });
});

describe('steam links', () => {
  it('upserts, reads by VN + appid, lists, stamps sync, and respects manual stickiness', () => {
    upsertVn({ id: 'v90001', title: 'Steam VN' });
    const link = setSteamLink({ vnId: 'v90001', appid: 12345, steamName: 'Some Game', source: 'manual' });
    expect(link.appid).toBe(12345);
    expect(getSteamLinkForVn('v90001')?.appid).toBe(12345);
    expect(getSteamLinkByAppid(12345)?.vn_id).toBe('v90001');
    expect(getSteamLinkForVn('v99999')).toBeNull();

    // An auto write must NOT clobber the manual link.
    setSteamLink({ vnId: 'v90001', appid: 99999, steamName: 'Auto Name', source: 'auto' });
    expect(getSteamLinkForVn('v90001')?.appid).toBe(12345);

    markSteamSynced('v90001', 420);
    expect(getSteamLinkForVn('v90001')?.last_synced_minutes).toBe(420);
    expect(listSteamLinks().map((l) => l.vn_id)).toEqual(['v90001']);

    expect(deleteSteamLink('v90001')).toBe(true);
    expect(deleteSteamLink('v90001')).toBe(false);
  });
});

describe('game log', () => {
  it('adds, lists newest-first, edits, and scopes edits/deletes to the VN', () => {
    upsertVn({ id: 'v90001', title: 'Logged VN' });
    const first = addGameLogEntry('v90001', '  first entry  ', 1000);
    const second = addGameLogEntry('v90001', 'second entry', 2000, 45);
    expect(first.note).toBe('first entry'); // trimmed.
    expect(second.session_minutes).toBe(45);
    expect(listGameLogForVn('v90001').map((e) => e.id)).toEqual([second.id, first.id]);

    const edited = updateGameLogEntry('v90001', first.id, { note: 'edited note', session_minutes: 10 });
    expect(edited?.note).toBe('edited note');
    expect(edited?.session_minutes).toBe(10);
    // Editing under the wrong VN scope returns null.
    expect(updateGameLogEntry('v99999', first.id, { note: 'x' })).toBeNull();

    expect(() => addGameLogEntry('v90001', '   ')).toThrow();
    expect(deleteGameLogEntry('v99999', first.id)).toBe(false);
    expect(deleteGameLogEntry('v90001', first.id)).toBe(true);
    expect(listGameLogForVn('v90001').map((e) => e.id)).toEqual([second.id]);
  });
});

describe('activity', () => {
  it('appends manual entries, lists per VN + recent (with title), and scopes deletes', () => {
    upsertVn({ id: 'v90001', title: 'Activity VN' });
    addToCollection('v90001', { status: 'planning' });
    const entry = addManualActivity('v90001', 'a manual note', 5000);
    expect(entry.kind).toBe('manual');
    expect(listActivityForVn('v90001').map((a) => a.id)).toContain(entry.id);

    const recent = listRecentActivity(10);
    expect(recent.find((r) => r.id === entry.id)?.title).toBe('Activity VN');

    expect(deleteActivityForVn(entry.id, 'v99999')).toBe(false);
    expect(deleteActivityForVn(entry.id, 'v90001')).toBe(true);
    expect(listActivityForVn('v90001').find((a) => a.id === entry.id)).toBeUndefined();
  });
});

describe('batch name lookups', () => {
  it('resolves VN, producer (with vn.developers fallback), staff, and character names', () => {
    upsertVn({
      id: 'v90001',
      title: 'Credited VN',
      developers: [{ id: 'p90002', name: 'Studio Fallback' }],
      staff: [{ id: 's90001', aid: 1, role: 'staff', name: 'Staff Person', original: null, lang: 'ja' }],
      va: [
        {
          note: null,
          character: { id: 'c90001', name: 'Character A', original: null, image: null },
          staff: { id: 's90002', aid: 2, name: 'Voice Person', original: null, lang: 'ja' },
        },
      ],
    });
    db.prepare('INSERT INTO producer (id, name, fetched_at) VALUES (?, ?, ?)').run('p90001', 'Studio Direct', Date.now());

    expect(batchGetVnTitles(['v90001', 'v99999']).get('v90001')).toBe('Credited VN');
    const prodNames = batchGetProducerNames(['p90001', 'p90002']);
    expect(prodNames.get('p90001')).toBe('Studio Direct');
    expect(prodNames.get('p90002')).toBe('Studio Fallback'); // resolved from vn.developers JSON.
    expect(batchGetStaffNames(['s90001', 's90002']).get('s90001')).toBe('Staff Person');
    expect(batchGetStaffNames(['s90002']).get('s90002')).toBe('Voice Person'); // VA fallback.
    expect(batchGetCharNames(['c90001']).get('c90001')).toBe('Character A');
  });
});

describe('manual EGS <-> VNDB links', () => {
  it('pins a VN→EGS mapping (and a null "no counterpart"), reads, and clears it', () => {
    upsertVn({ id: 'v90001', title: 'Linkable VN' });
    setVnEgsLink('v90001', 4242, 'note');
    expect(getVnEgsLink('v90001')).toMatchObject({ vn_id: 'v90001', egs_id: 4242, note: 'note' });
    setVnEgsLink('v90001', null);
    expect(getVnEgsLink('v90001')?.egs_id).toBeNull();
    clearVnEgsLink('v90001');
    expect(getVnEgsLink('v90001')).toBeNull();
    expect(() => setVnEgsLink('not-a-vn', 1)).toThrow();
    expect(() => setVnEgsLink('v90001', -5)).toThrow();
  });

  it('pins an EGS→VN mapping, reads, lists all, and clears it', () => {
    setEgsVnLink(5001, 'v90001', 'pinned');
    expect(getEgsVnLink(5001)).toMatchObject({ egs_id: 5001, vn_id: 'v90001' });
    setEgsVnLink(5002, null);
    expect(listAllEgsVnLinks().get(5002)).toBeNull();
    expect(listAllEgsVnLinks().get(5001)).toBe('v90001');
    clearEgsVnLink(5001);
    expect(getEgsVnLink(5001)).toBeNull();
    expect(() => setEgsVnLink(0, 'v90001')).toThrow();
    expect(() => setEgsVnLink(5003, 'bad-id')).toThrow();
  });
});
