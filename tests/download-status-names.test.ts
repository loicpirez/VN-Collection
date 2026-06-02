/**
 * Pins the `enrichJobs` annotator that turns the raw `DownloadJob` rows
 * into `EnrichedJob` rows for the DownloadStatusBar / `/api/download-status`
 * route. The annotator looks up display names from four batch helpers
 * (VN titles / producer names / staff names / character names) keyed by
 * the id prefix on `current_item` and `vn_id`.
 *
 * Coverage:
 *   1. id-prefix routing (v / p / s / c → the right batch table).
 *   2. unknown prefix (tag / trait / free-text label) stays unmapped.
 *   3. unknown id within a known prefix lands as `null`, not a crash.
 *   4. `vn_id` resolves independently of `current_item`.
 *   5. multiple jobs share a single batch lookup per prefix.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { db, upsertVn, type RawVnPayload } from '@/lib/db';
import { enrichJobs } from '@/lib/download-status-names';
import type { DownloadJob } from '@/lib/download-status';

const NOW = Date.now();

const baseJob = (over: Partial<DownloadJob>): DownloadJob => ({
  id: 'job-1',
  kind: 'staff',
  vn_id: null,
  label: 'Staff fan-out',
  total: 5,
  done: 0,
  errors: [],
  started_at: NOW,
  finished_at: null,
  current_item: null,
  ...over,
});

function seedVn(id: string, title: string): void {
  upsertVn({
    id,
    title,
    image: null,
    released: null,
    rating: null,
    votecount: null,
    length_minutes: null,
    description: null,
    developers: [],
    tags: [],
  } as unknown as RawVnPayload);
}

function seedProducer(id: string, name: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO producer (id, name, fetched_at) VALUES (?, ?, ?)`,
  ).run(id, name, NOW);
}

function seedStaffCredit(sid: string, name: string): void {
  // batchGetStaffNames reads from vn_staff_credit (the materialised
  // index built from vn.staff JSON). Synthetic credit row pinned to a
  // throwaway VN id.
  const vnId = 'v95000';
  seedVn(vnId, 'Staff host VN');
  db.prepare(
    `INSERT INTO vn_staff_credit (vn_id, sid, role, name, original, lang)
     VALUES (?, ?, 'staff', ?, NULL, NULL)`,
  ).run(vnId, sid, name);
}

function seedCharacter(cid: string, name: string): void {
  // batchGetCharNames reads vn_va_credit.c_id → c_name. Synthetic VA
  // row pinned to a throwaway VN id.
  const vnId = 'v95001';
  seedVn(vnId, 'Character host VN');
  db.prepare(
    `INSERT INTO vn_va_credit (vn_id, sid, aid, c_id, c_name, c_original, c_image_url, va_name, va_original, va_lang, note)
     VALUES (?, ?, NULL, ?, ?, NULL, NULL, 'VA', NULL, NULL, NULL)`,
  ).run(vnId, 's95001', cid, name);
}

describe('enrichJobs', () => {
  beforeEach(() => {
    db.exec(`DELETE FROM vn_va_credit; DELETE FROM vn_staff_credit; DELETE FROM producer; DELETE FROM vn;`);
  });

  it('returns an empty array for an empty input', () => {
    expect(enrichJobs([])).toEqual([]);
  });

  it('resolves `vn_id` against batchGetVnTitles', () => {
    seedVn('v90000', 'Alpha title');
    const out = enrichJobs([baseJob({ id: 'j1', vn_id: 'v90000' })]);
    expect(out).toHaveLength(1);
    expect(out[0].vn_title).toBe('Alpha title');
    expect(out[0].current_item_name).toBe(null);
  });

  it('routes a `v…` current_item to vn titles', () => {
    seedVn('v90100', 'VN current');
    const out = enrichJobs([baseJob({ current_item: 'v90100' })]);
    expect(out[0].current_item_name).toBe('VN current');
    expect(out[0].vn_title).toBe(null);
  });

  it('routes a `p…` current_item to producer names', () => {
    seedProducer('p90200', 'Studio P');
    const out = enrichJobs([baseJob({ current_item: 'p90200' })]);
    expect(out[0].current_item_name).toBe('Studio P');
  });

  it('routes an `s…` current_item to staff names', () => {
    seedStaffCredit('s90300', 'Staff S');
    const out = enrichJobs([baseJob({ current_item: 's90300' })]);
    expect(out[0].current_item_name).toBe('Staff S');
  });

  it('routes a `c…` current_item to character names', () => {
    seedCharacter('c90400', 'Character C');
    const out = enrichJobs([baseJob({ current_item: 'c90400' })]);
    expect(out[0].current_item_name).toBe('Character C');
  });

  it('returns null when an id matches a known prefix but no row exists', () => {
    const out = enrichJobs([baseJob({ current_item: 'v99999' })]);
    expect(out[0].current_item_name).toBe(null);
  });

  it('leaves an unknown-prefix id unmapped (tag/trait/free-text)', () => {
    // Tag ids (`g…`), trait ids (`i…`), and free-text labels do not
    // route to any of the four prefix tables. The annotator must NOT
    // throw — it simply returns null for current_item_name.
    const out = enrichJobs([
      baseJob({ current_item: 'g123' }),
      baseJob({ id: 'j2', current_item: 'i456' }),
      baseJob({ id: 'j3', current_item: 'pulling release art' }),
    ]);
    for (const row of out) {
      expect(row.current_item_name).toBe(null);
    }
  });

  it('maps stock-provider current items and leaves missing names null', () => {
    const out = enrichJobs([
      baseJob({ current_item: 'sofmap' }),
      baseJob({ id: 'j2', current_item: 'p99999' }),
      baseJob({ id: 'j3', current_item: 's99999' }),
      baseJob({ id: 'j4', current_item: 'c99999' }),
      baseJob({ id: 'j5', vn_id: 'v99999' }),
    ]);
    expect(out[0].current_item_name).toBe('Sofmap / Recole');
    expect(out.slice(1).map((row) => row.current_item_name)).toEqual([null, null, null, null]);
    expect(out[4].vn_title).toBeNull();
  });

  it('passes through every other DownloadJob field unchanged', () => {
    seedVn('v90500', 'Pass-through title');
    const input = baseJob({
      id: 'jX',
      kind: 'producers',
      vn_id: 'v90500',
      label: 'Fan-out',
      total: 42,
      done: 17,
      errors: [{ item: 'p1', message: 'boom' }],
      finished_at: NOW + 1000,
    });
    const out = enrichJobs([input]);
    expect(out[0]).toMatchObject({
      id: 'jX',
      kind: 'producers',
      vn_id: 'v90500',
      label: 'Fan-out',
      total: 42,
      done: 17,
      vn_title: 'Pass-through title',
      errors: [{ item: 'p1', message: 'boom' }],
      finished_at: NOW + 1000,
    });
  });

  it('reuses one batch lookup per prefix across multiple jobs', () => {
    seedVn('v90600', 'Shared VN');
    seedVn('v90601', 'Other VN');
    seedProducer('p90602', 'Shared producer');
    const out = enrichJobs([
      baseJob({ id: 'a', vn_id: 'v90600', current_item: 'p90602' }),
      baseJob({ id: 'b', vn_id: 'v90601', current_item: 'v90600' }),
      baseJob({ id: 'c', current_item: 'p90602' }),
    ]);
    expect(out[0].vn_title).toBe('Shared VN');
    expect(out[0].current_item_name).toBe('Shared producer');
    expect(out[1].vn_title).toBe('Other VN');
    expect(out[1].current_item_name).toBe('Shared VN');
    expect(out[2].current_item_name).toBe('Shared producer');
  });
});
