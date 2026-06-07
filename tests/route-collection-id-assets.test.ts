import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { db, upsertVn } from '@/lib/db';
import * as dbModule from '@/lib/db';
import * as activityModule from '@/lib/activity';

const {
  getVnMock,
  refreshVnMock,
  resolveEgsMock,
  ensureImagesMock,
  staffMock,
  charMock,
  producerMock,
  releasesMock,
  screenshotReleasesMock,
  tagsMock,
  traitsMock,
  relationsMock,
  scrapeProducersMock,
  scrapeTagDagMock,
  scrapeCharactersMock,
} = vi.hoisted(() => ({
  getVnMock: vi.fn(),
  refreshVnMock: vi.fn(),
  resolveEgsMock: vi.fn(),
  ensureImagesMock: vi.fn(),
  staffMock: vi.fn(),
  charMock: vi.fn(),
  producerMock: vi.fn(),
  releasesMock: vi.fn(),
  screenshotReleasesMock: vi.fn(),
  tagsMock: vi.fn(),
  traitsMock: vi.fn(),
  relationsMock: vi.fn(),
  scrapeProducersMock: vi.fn(),
  scrapeTagDagMock: vi.fn(),
  scrapeCharactersMock: vi.fn(),
}));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, getVn: getVnMock, refreshVn: refreshVnMock };
});

vi.mock('@/lib/erogamescape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/erogamescape')>();
  return { ...actual, resolveEgsForVn: resolveEgsMock };
});

vi.mock('@/lib/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/assets')>();
  return { ...actual, ensureLocalImagesForVn: ensureImagesMock };
});

vi.mock('@/lib/staff-full', () => ({ downloadFullStaffForVn: staffMock }));
vi.mock('@/lib/character-full', () => ({ downloadFullCharForVn: charMock }));
vi.mock('@/lib/producer-full', () => ({ downloadFullProducerForVn: producerMock }));
vi.mock('@/lib/release-full', () => ({
  downloadFullReleasesForVn: releasesMock,
  downloadScreenshotReleasesForVn: screenshotReleasesMock,
}));
vi.mock('@/lib/tag-full', () => ({ downloadFullTagsForVn: tagsMock }));
vi.mock('@/lib/trait-full', () => ({ downloadFullTraitsForVn: traitsMock }));
vi.mock('@/lib/relations-full', () => ({ downloadFullRelationsForVn: relationsMock }));
vi.mock('@/lib/scrape-producer-relations', () => ({ scrapeProducersForVn: scrapeProducersMock }));
vi.mock('@/lib/scrape-tag-dag', () => ({ scrapeTagDagForVn: scrapeTagDagMock }));
vi.mock('@/lib/scrape-character-instances', () => ({ scrapeCharactersForVn: scrapeCharactersMock }));

import { POST as assetsPOST } from '@/app/api/collection/[id]/assets/route';
import { EgsUnreachable } from '@/lib/erogamescape';

const REAL_VN = 'v90601';
const EGS_VN = 'egs_90602';

function localReq(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function clear(): void {
  db.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run(REAL_VN, EGS_VN);
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(REAL_VN, EGS_VN);
}

beforeEach(() => {
  getVnMock.mockReset();
  refreshVnMock.mockReset().mockResolvedValue(null);
  resolveEgsMock.mockReset();
  ensureImagesMock.mockReset();
  staffMock.mockReset().mockResolvedValue(null);
  charMock.mockReset().mockResolvedValue(null);
  producerMock.mockReset().mockResolvedValue(null);
  releasesMock.mockReset().mockResolvedValue(null);
  screenshotReleasesMock.mockReset().mockResolvedValue(null);
  tagsMock.mockReset().mockResolvedValue(null);
  traitsMock.mockReset().mockResolvedValue(null);
  relationsMock.mockReset().mockResolvedValue(null);
  scrapeProducersMock.mockReset().mockResolvedValue(null);
  scrapeTagDagMock.mockReset().mockResolvedValue(null);
  scrapeCharactersMock.mockReset().mockResolvedValue(null);
  clear();
});

afterEach(clear);

describe('POST /api/collection/[id]/assets', () => {
  it('400 on an invalid vn id', async () => {
    const res = await assetsPOST(localReq('/api/collection/bad/assets'), ctx('bad-id'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid vn id');
  });

  it('404 for a synthetic egs-only id with no local row', async () => {
    const res = await assetsPOST(localReq('/api/collection/egs_90602/assets'), ctx(EGS_VN));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/synthetic VN with no local row/);
  });

  it('404 when an unknown VNDB id has no upstream record', async () => {
    getVnMock.mockResolvedValue(null);
    const res = await assetsPOST(localReq('/api/collection/v90601/assets'), ctx(REAL_VN));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('VN not found on VNDB');
    expect(getVnMock).toHaveBeenCalledOnce();
  });

  it('502 when hydrating an unknown VNDB id fails upstream', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getVnMock.mockRejectedValue(new Error('VNDB unavailable'));
    const res = await assetsPOST(localReq('/api/collection/v90601/assets'), ctx(REAL_VN));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream service unavailable' });
    consoleSpy.mockRestore();
  });

  it('hydrates a missing VNDB row before downloading assets', async () => {
    getVnMock.mockResolvedValue({ id: REAL_VN, title: 'Hydrated Assets' });
    resolveEgsMock.mockResolvedValue({ game: null, source: 'none' });
    ensureImagesMock.mockResolvedValue({ poster: null, posterThumb: null, screenshots: ['s'], releaseImages: ['r'] });
    const res = await assetsPOST(localReq('/api/collection/v90601/assets'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, screenshot_count: 1, release_image_count: 1 });
    const row = db.prepare('SELECT title FROM vn WHERE id = ?').get(REAL_VN) as { title: string };
    expect(row.title).toBe('Hydrated Assets');
  });

  it('200 with the asset summary when the row already exists', async () => {
    upsertVn({ id: REAL_VN, title: 'Synthetic Assets' });
    resolveEgsMock.mockResolvedValue({ game: null, source: 'none' });
    ensureImagesMock.mockResolvedValue({ poster: 'p.jpg', posterThumb: 't.jpg', screenshots: [], releaseImages: [] });
    const res = await assetsPOST(localReq('/api/collection/v90601/assets'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, poster: 'p.jpg', screenshot_count: 0, egs_warning: null });
  });

  it('skips VNDB fan-outs for an existing EGS-only synthetic row', async () => {
    upsertVn({ id: EGS_VN, title: 'Synthetic EGS Assets' });
    resolveEgsMock.mockResolvedValue({ game: null, source: 'none' });
    ensureImagesMock.mockResolvedValue({ poster: null, posterThumb: null, screenshots: [], releaseImages: [] });

    const res = await assetsPOST(localReq('/api/collection/egs_90602/assets'), ctx(EGS_VN));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, egs_warning: null });
    expect(refreshVnMock).not.toHaveBeenCalled();
    expect(staffMock).not.toHaveBeenCalled();
    expect(charMock).not.toHaveBeenCalled();
    expect(producerMock).not.toHaveBeenCalled();
    expect(releasesMock).not.toHaveBeenCalled();
    expect(tagsMock).not.toHaveBeenCalled();
    expect(traitsMock).not.toHaveBeenCalled();
    expect(relationsMock).not.toHaveBeenCalled();
  });

  it('refreshes VNDB data and forwards force to every fan-out worker', async () => {
    upsertVn({ id: REAL_VN, title: 'Before Refresh' });
    refreshVnMock.mockResolvedValue({ id: REAL_VN, title: 'After Refresh' });
    resolveEgsMock.mockResolvedValue({ game: null, source: 'none' });
    ensureImagesMock.mockResolvedValue({ poster: null, posterThumb: null, screenshots: [], releaseImages: [] });

    const res = await assetsPOST(localReq('/api/collection/v90601/assets?refresh=true'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(refreshVnMock).toHaveBeenCalledWith(REAL_VN);
    for (const fn of [
      staffMock,
      charMock,
      producerMock,
      releasesMock,
      screenshotReleasesMock,
      tagsMock,
      traitsMock,
      relationsMock,
      scrapeProducersMock,
      scrapeTagDagMock,
      scrapeCharactersMock,
    ]) {
      expect(fn).toHaveBeenCalledWith(REAL_VN, { force: true });
    }
    const row = db.prepare('SELECT title FROM vn WHERE id = ?').get(REAL_VN) as { title: string };
    expect(row.title).toBe('After Refresh');
  });

  it('reports EGS unreachable as a warning while keeping the asset download successful', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    upsertVn({ id: REAL_VN, title: 'Synthetic Assets' });
    resolveEgsMock.mockRejectedValue(new EgsUnreachable('blocked', 'HTTP 403', 403));
    ensureImagesMock.mockResolvedValue({ poster: null, posterThumb: null, screenshots: [], releaseImages: [] });

    const res = await assetsPOST(localReq('/api/collection/v90601/assets'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect((await res.json()).egs_warning).toEqual({ kind: 'blocked', status: 403 });
    consoleSpy.mockRestore();
  });

  it('reports non-EGS resolve failures as server warnings', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    upsertVn({ id: REAL_VN, title: 'Synthetic Assets' });
    resolveEgsMock.mockRejectedValue(new Error('mapping failed'));
    ensureImagesMock.mockResolvedValue({ poster: null, posterThumb: null, screenshots: [], releaseImages: [] });

    const res = await assetsPOST(localReq('/api/collection/v90601/assets'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect((await res.json()).egs_warning).toEqual({ kind: 'server', status: null });
    consoleSpy.mockRestore();
  });

  it('returns sync failed when local image mirroring fails', async () => {
    upsertVn({ id: REAL_VN, title: 'Synthetic Assets' });
    resolveEgsMock.mockResolvedValue({ game: null, source: 'none' });
    ensureImagesMock.mockRejectedValue(new Error('disk full'));

    const res = await assetsPOST(localReq('/api/collection/v90601/assets'), ctx(REAL_VN));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'sync failed', egs_warning: null });
  });

  it('logs every fan-out rejection without failing the asset response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    upsertVn({ id: REAL_VN, title: 'Synthetic Assets' });
    resolveEgsMock.mockResolvedValue({ game: null, source: 'none' });
    ensureImagesMock.mockResolvedValue({ poster: null, posterThumb: null, screenshots: [], releaseImages: [] });
    staffMock.mockRejectedValue(new Error('staff'));
    charMock.mockRejectedValue(new Error('character'));
    producerMock.mockRejectedValue(new Error('producer'));
    releasesMock.mockRejectedValue(new Error('release'));
    tagsMock.mockRejectedValue(new Error('tag'));
    traitsMock.mockRejectedValue(new Error('trait'));
    screenshotReleasesMock.mockRejectedValue(new Error('screenshot-release'));
    relationsMock.mockRejectedValue(new Error('relations'));
    scrapeProducersMock.mockRejectedValue(new Error('producer-scrape'));
    scrapeTagDagMock.mockRejectedValue(new Error('tag-DAG'));
    scrapeCharactersMock.mockRejectedValue(new Error('character-scrape'));

    const res = await assetsPOST(localReq('/api/collection/v90601/assets'), ctx(REAL_VN));
    await Promise.resolve();
    await Promise.resolve();

    expect(res.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith('[assets:v90601] staff fan-out failed:', 'staff');
    expect(consoleSpy).toHaveBeenCalledWith('[assets:v90601] character fan-out failed:', 'character');
    expect(consoleSpy).toHaveBeenCalledWith('[assets:v90601] producer fan-out failed:', 'producer');
    expect(consoleSpy).toHaveBeenCalledWith('[assets:v90601] release fan-out failed:', 'release');
    expect(consoleSpy).toHaveBeenCalledWith('[assets:v90601] tag fan-out failed:', 'tag');
    expect(consoleSpy).toHaveBeenCalledWith('[assets:v90601] trait fan-out failed:', 'trait');
    expect(consoleSpy).toHaveBeenCalledWith('[assets:v90601] screenshot-release fan-out failed:', 'screenshot-release');
    expect(consoleSpy).toHaveBeenCalledWith('[assets:v90601] relations fan-out failed:', 'relations');
    expect(consoleSpy).toHaveBeenCalledWith('[assets:v90601] producer-scrape fan-out failed:', 'producer-scrape');
    expect(consoleSpy).toHaveBeenCalledWith('[assets:v90601] tag-DAG scrape fan-out failed:', 'tag-DAG');
    expect(consoleSpy).toHaveBeenCalledWith('[assets:v90601] character-scrape fan-out failed:', 'character-scrape');
    consoleSpy.mockRestore();
  });

  it('logs release-meta and activity failures while returning the asset payload', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const materializeSpy = vi.spyOn(dbModule, 'materializeReleaseMetaForVn').mockImplementation(() => {
      throw new Error('meta cache');
    });
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => {
      throw new Error('activity');
    });
    upsertVn({ id: REAL_VN, title: 'Synthetic Assets' });
    resolveEgsMock.mockResolvedValue({ game: null, source: 'none' });
    ensureImagesMock.mockResolvedValue({ poster: null, posterThumb: null, screenshots: ['s'], releaseImages: ['r'] });

    const res = await assetsPOST(localReq('/api/collection/v90601/assets?refresh=true'), ctx(REAL_VN));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, screenshot_count: 1, release_image_count: 1 });
    expect(consoleSpy).toHaveBeenCalledWith('[assets:v90601] release-meta materialize failed:', 'meta cache');
    expect(consoleSpy).toHaveBeenCalledWith('[assets:v90601] activity log failed:', 'activity');
    materializeSpy.mockRestore();
    activitySpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
