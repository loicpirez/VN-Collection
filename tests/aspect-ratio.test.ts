import { beforeEach, describe, expect, it } from 'vitest';
import {
  listCollection,
  setOwnedReleaseAspectOverride,
  upsertReleaseResolutionCache,
  db,
} from '@/lib/db';
import { aspectKeyForResolution, parseResolutionValue } from '@/lib/aspect-ratio';

function clear(): void {
  db.exec(`
    DELETE FROM owned_release_aspect_override;
    DELETE FROM release_resolution_cache;
    DELETE FROM owned_release;
    DELETE FROM collection;
    DELETE FROM vn;
  `);
}

function ensureOwned(vnId: string, releaseId: string, title = vnId): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO vn (id, title, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title`,
  ).run(vnId, title, now);
  db.prepare(
    `INSERT INTO collection (vn_id, status, added_at, updated_at)
     VALUES (?, 'planning', ?, ?)
     ON CONFLICT(vn_id) DO NOTHING`,
  ).run(vnId, now, now);
  db.prepare(
    `INSERT INTO owned_release (vn_id, release_id, added_at)
     VALUES (?, ?, ?)
     ON CONFLICT(vn_id, release_id) DO NOTHING`,
  ).run(vnId, releaseId, now);
}

beforeEach(() => {
  clear();
});

describe('aspect ratio helpers', () => {
  it('normalizes common resolution buckets', () => {
    expect(aspectKeyForResolution(640, 480)).toBe('4:3');
    expect(aspectKeyForResolution(1280, 720)).toBe('16:9');
    expect(aspectKeyForResolution(1920, 1200)).toBe('16:10');
    expect(aspectKeyForResolution(2560, 1080)).toBe('21:9');
    expect(aspectKeyForResolution(1000, 1000)).toBe('other');
    expect(aspectKeyForResolution(0, 720)).toBe('unknown');
  });

  it('parses VNDB resolution arrays and strings', () => {
    expect(parseResolutionValue([1920, 1080])).toEqual({ width: 1920, height: 1080 });
    expect(parseResolutionValue('1280×720')).toEqual({ width: 1280, height: 720 });
    expect(parseResolutionValue('800x600')).toEqual({ width: 800, height: 600 });
    expect(parseResolutionValue('unknown')).toBeNull();
  });
});

describe('collection aspect filtering', () => {
  it('filters by VNDB release resolution cache', () => {
    ensureOwned('v1', 'r1', 'Wide');
    ensureOwned('v2', 'r2', 'Classic');
    upsertReleaseResolutionCache({ releaseId: 'r1', resolution: [1280, 720] });
    upsertReleaseResolutionCache({ releaseId: 'r2', resolution: [640, 480] });

    expect(listCollection({ aspect: '16:9' }).map((v) => v.id)).toEqual(['v1']);
    expect(listCollection({ aspect: '4:3' }).map((v) => v.id)).toEqual(['v2']);
  });

  it('manual overrides take precedence over VNDB cache', () => {
    ensureOwned('v1', 'r1', 'Override');
    upsertReleaseResolutionCache({ releaseId: 'r1', resolution: [640, 480] });
    setOwnedReleaseAspectOverride({ vnId: 'v1', releaseId: 'r1', width: 1280, height: 720 });

    expect(listCollection({ aspect: '16:9' }).map((v) => v.id)).toEqual(['v1']);
    expect(listCollection({ aspect: '4:3' }).map((v) => v.id)).toEqual([]);
  });

  it('unknown includes collection entries without known release aspect', () => {
    ensureOwned('v1', 'r1', 'Unknown');
    ensureOwned('v2', 'r2', 'Known');
    upsertReleaseResolutionCache({ releaseId: 'r2', resolution: [1280, 720] });

    expect(listCollection({ aspect: 'unknown' }).map((v) => v.id)).toEqual(['v1']);
  });
});

