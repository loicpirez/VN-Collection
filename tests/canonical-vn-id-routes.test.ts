import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE as deleteReadingQueue, POST as postReadingQueue } from '@/app/api/reading-queue/route';
import { POST as postEgsVndbLink } from '@/app/api/egs/[id]/vndb/route';
import { DELETE as deleteSeriesVn, POST as postSeriesVn } from '@/app/api/series/[id]/vn/[vnId]/route';
import { POST as postAliceNetLink } from '@/app/api/alicenet/[code]/link/route';
import {
  addToCollection,
  addToReadingQueue,
  addVnToSeries,
  clearEgsVnLink,
  clearAliceNetVnLink,
  clearVnEgsLink,
  createSeries,
  db,
  getEgsVnLink,
  getAliceNetStockItem,
  getVnEgsLink,
  listReadingQueue,
  removeFromReadingQueue,
  setEgsVnLink,
  setAliceNetVnLink,
  setVnEgsLink,
  upsertVn,
} from '@/lib/db';

const ROOT = join(__dirname, '..');
const VN_ID = 'v99874';
const EGS_ID = 99874;
const ALICENET_CODE = '998-998740-998';

function jsonRequest(path: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  db.prepare('DELETE FROM reading_queue WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM series_vn WHERE vn_id = ?').run(VN_ID);
  clearVnEgsLink(VN_ID);
  clearEgsVnLink(EGS_ID);
  db.prepare('DELETE FROM alicenet_stock WHERE code = ?').run(ALICENET_CODE);
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
  upsertVn({ id: VN_ID, title: 'Canonical id fixture' });
  addToCollection(VN_ID);
  db.prepare(
    'INSERT INTO alicenet_stock (code, title, fetched_at, updated_at) VALUES (?, ?, ?, ?)',
  ).run(ALICENET_CODE, 'Canonical id stock fixture', Date.now(), Date.now());
});

describe('canonical VN id persistence helpers', () => {
  it('normalizes reading-queue inserts and removals', () => {
    addToReadingQueue(VN_ID.toUpperCase());
    expect(listReadingQueue().some((entry) => entry.vn_id === VN_ID)).toBe(true);
    expect(removeFromReadingQueue(VN_ID.toUpperCase())).toBe(true);
  });

  it('normalizes EGS mapping pins and lookups', () => {
    setVnEgsLink(VN_ID.toUpperCase(), EGS_ID);
    expect(getVnEgsLink(VN_ID.toUpperCase())?.vn_id).toBe(VN_ID);
    setEgsVnLink(EGS_ID, VN_ID.toUpperCase());
    expect(getEgsVnLink(EGS_ID)?.vn_id).toBe(VN_ID);
  });

  it('normalizes series and AliceNet links', () => {
    const series = createSeries(`Canonical helper fixture ${Date.now()}`);
    addVnToSeries(series.id, VN_ID.toUpperCase());
    const linked = db
      .prepare('SELECT vn_id FROM series_vn WHERE series_id = ?')
      .get(series.id) as { vn_id: string };
    expect(linked.vn_id).toBe(VN_ID);
    setAliceNetVnLink(ALICENET_CODE, VN_ID.toUpperCase(), 'manual');
    expect(getAliceNetStockItem(ALICENET_CODE)?.vn_id).toBe(VN_ID);
    clearAliceNetVnLink(ALICENET_CODE);
  });
});

describe('canonical VN id route boundaries', () => {
  it('normalizes reading-queue add and remove ids', async () => {
    const addResponse = await postReadingQueue(jsonRequest('/api/reading-queue', 'POST', {
      vn_id: VN_ID.toUpperCase(),
    }));
    expect(addResponse.status).toBe(200);
    expect((await addResponse.json()).entry.vn_id).toBe(VN_ID);
    const removeResponse = await deleteReadingQueue(new NextRequest(
      `http://127.0.0.1/api/reading-queue?vn_id=${VN_ID.toUpperCase()}`,
      { method: 'DELETE' },
    ));
    expect(removeResponse.status).toBe(200);
  });

  it('normalizes manual EGS and AliceNet pins', async () => {
    const egsResponse = await postEgsVndbLink(
      jsonRequest(`/api/egs/${EGS_ID}/vndb`, 'POST', { vndb_id: VN_ID.toUpperCase() }),
      { params: Promise.resolve({ id: String(EGS_ID) }) },
    );
    expect(egsResponse.status).toBe(200);
    expect(getEgsVnLink(EGS_ID)?.vn_id).toBe(VN_ID);

    const alicenetResponse = await postAliceNetLink(
      jsonRequest(`/api/alicenet/${ALICENET_CODE}/link`, 'POST', { vn_id: VN_ID.toUpperCase() }),
      { params: Promise.resolve({ code: ALICENET_CODE }) },
    );
    expect(alicenetResponse.status).toBe(200);
    expect(getAliceNetStockItem(ALICENET_CODE)?.vn_id).toBe(VN_ID);
  });

  it('normalizes series add and remove ids', async () => {
    const series = createSeries(`Canonical route fixture ${Date.now()}`);
    const context = { params: Promise.resolve({ id: String(series.id), vnId: VN_ID.toUpperCase() }) };
    const addResponse = await postSeriesVn(
      jsonRequest(`/api/series/${series.id}/vn/${VN_ID.toUpperCase()}`, 'POST', {}),
      context,
    );
    expect(addResponse.status).toBe(200);
    expect((await addResponse.json()).added).toEqual([VN_ID]);
    const removeResponse = await deleteSeriesVn(
      new NextRequest(`http://127.0.0.1/api/series/${series.id}/vn/${VN_ID.toUpperCase()}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: String(series.id), vnId: VN_ID.toUpperCase() }) },
    );
    expect(removeResponse.status).toBe(200);
    expect(db.prepare('SELECT 1 FROM series_vn WHERE series_id = ?').get(series.id)).toBeUndefined();
  });

  it('normalizes bulk and upstream VN ids before use', () => {
    const egsSync = readFileSync(join(ROOT, 'src/app/api/egs/sync/route.ts'), 'utf8');
    const fullDownload = readFileSync(join(ROOT, 'src/app/api/collection/full-download/route.ts'), 'utf8');
    const wishlist = readFileSync(join(ROOT, 'src/app/api/wishlist/[id]/route.ts'), 'utf8');
    const vndbStatus = readFileSync(join(ROOT, 'src/app/api/vn/[id]/vndb-status/route.ts'), 'utf8');
    expect(egsSync).toContain(".map((id) => id.toLowerCase())");
    expect(fullDownload).toContain(".map((id) => id.toLowerCase())");
    expect(wishlist).toContain('const vnId = id.toLowerCase();');
    expect(vndbStatus).toContain('const vnId = id.toLowerCase();');
  });
});
