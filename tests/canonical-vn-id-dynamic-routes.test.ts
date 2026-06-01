import { readFileSync } from 'node:fs';
import { describe, expect, it, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as collectionGET } from '@/app/api/collection/[id]/route';
import { POST as ownedReleasePOST } from '@/app/api/collection/[id]/owned-releases/route';
import { PATCH as aspectPATCH } from '@/app/api/vn/[id]/aspect/route';
import { GET as listsGET } from '@/app/api/vn/[id]/lists/route';
import {
  addToCollection,
  addVnToList,
  createUserList,
  db,
  getVnAspectOverride,
} from '@/lib/db';
import { normalizeVnId } from '@/lib/vn-id';

const VN_ID = 'v990020';
const UPPER_VN_ID = VN_ID.toUpperCase();
const SYNTHETIC_RELEASE_ID = `synthetic:${VN_ID}`;
const LIST_NAME = 'Canonical dynamic route fixture';

function jsonRequest(path: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctx(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: UPPER_VN_ID }) };
}

beforeEach(() => {
  db.prepare('DELETE FROM user_list WHERE name = ?').run(LIST_NAME);
  db.prepare('DELETE FROM owned_release WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn_aspect_override WHERE vn_id IN (?, ?)').run(VN_ID, UPPER_VN_ID);
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
  db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(VN_ID, 'Fixture', Date.now());
  addToCollection(VN_ID);
});

describe('canonical VN id dynamic-route boundaries', () => {
  it('canonicalizes uppercase VN identifiers', () => {
    expect(normalizeVnId(UPPER_VN_ID)).toBe(VN_ID);
    expect(normalizeVnId('EGS_990020')).toBe('egs_990020');
  });

  it('reads collection rows through uppercase route ids', async () => {
    const response = await collectionGET(new NextRequest(`http://127.0.0.1/api/collection/${UPPER_VN_ID}`), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()).item.id).toBe(VN_ID);
  });

  it('writes aspect overrides through uppercase route ids', async () => {
    const response = await aspectPATCH(
      jsonRequest(`/api/vn/${UPPER_VN_ID}/aspect`, 'PATCH', { aspect_key: '16:9' }),
      ctx(),
    );
    expect(response.status).toBe(200);
    expect(getVnAspectOverride(VN_ID)?.aspect_key).toBe('16:9');
    expect(getVnAspectOverride(UPPER_VN_ID)).toBeNull();
  });

  it('reads list memberships through uppercase route ids', async () => {
    const list = createUserList({ name: LIST_NAME });
    addVnToList(list.id, VN_ID);
    const response = await listsGET(new NextRequest(`http://127.0.0.1/api/vn/${UPPER_VN_ID}/lists`), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()).lists.map((row: { id: number }) => row.id)).toEqual([list.id]);
  });

  it('accepts canonical synthetic releases through uppercase route ids', async () => {
    const response = await ownedReleasePOST(
      jsonRequest(`/api/collection/${UPPER_VN_ID}/owned-releases`, 'POST', {
        release_id: SYNTHETIC_RELEASE_ID,
      }),
      ctx(),
    );
    expect(response.status).toBe(200);
    expect(
      db.prepare('SELECT release_id FROM owned_release WHERE vn_id = ?').get(VN_ID),
    ).toEqual({ release_id: SYNTHETIC_RELEASE_ID });
  });

  it('pins canonicalization to every shared-validator route module', () => {
    const routeFiles = [
      'src/app/api/collection/[id]/route.ts',
      'src/app/api/collection/[id]/activity/route.ts',
      'src/app/api/collection/[id]/assets/route.ts',
      'src/app/api/collection/[id]/banner/route.ts',
      'src/app/api/collection/[id]/cover/route.ts',
      'src/app/api/collection/[id]/custom-description/route.ts',
      'src/app/api/collection/[id]/game-log/route.ts',
      'src/app/api/collection/[id]/owned-releases/route.ts',
      'src/app/api/collection/[id]/routes/route.ts',
      'src/app/api/collection/[id]/source-pref/route.ts',
      'src/app/api/vn/[id]/aspect/route.ts',
      'src/app/api/vn/[id]/lists/route.ts',
    ];
    for (const routeFile of routeFiles) {
      expect(readFileSync(routeFile, 'utf8')).toContain('normalizeVnId(rawId)');
    }
  });
});
