import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/collection/[id]/cover/route';
import { addToCollection, db, getCollectionItem, upsertVn } from '@/lib/db';
import { PayloadTooLargeError } from '@/lib/read-limited-body';
import { UnsupportedFileType } from '@/lib/files';

const { saveUploadMock, reparseWithLimitMock } = vi.hoisted(() => ({
  saveUploadMock: vi.fn(),
  reparseWithLimitMock: vi.fn(),
}));

vi.mock('@/lib/files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/files')>();
  return { ...actual, saveUpload: saveUploadMock };
});

vi.mock('@/lib/read-limited-body', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/read-limited-body')>();
  return { ...actual, reparseWithLimit: reparseWithLimitMock };
});

const VN_ID = 'v990801';
const MAX_COVER_BYTES = 10 * 1024 * 1024;

function ctx(id = VN_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function jsonReq(body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/collection/${VN_ID}/cover`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function jsonReqWithoutContentType(body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/collection/${VN_ID}/cover`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function emptyPostReq(): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/collection/${VN_ID}/cover`, { method: 'POST' });
}

function multipartReq(body: BodyInit, headers: HeadersInit = {}): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/collection/${VN_ID}/cover`, {
    method: 'POST',
    headers,
    body,
  });
}

function formReq(form: FormData): NextRequest {
  return multipartReq(form);
}

beforeEach(() => {
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
  upsertVn({ id: VN_ID, title: 'Cover Branches' });
  addToCollection(VN_ID, { status: 'planning' });
  saveUploadMock.mockReset();
  reparseWithLimitMock.mockReset().mockImplementation(async (req: Request) => req);
});

afterEach(() => {
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
});

describe('POST /api/collection/[id]/cover JSON sources', () => {
  it('rejects invalid route ids before reading JSON', async () => {
    const res = await POST(jsonReq({ source: 'path', value: 'cover/front.jpg' }), ctx('bad'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid vn id' });
  });

  it('accepts allowlisted remote URLs and local release paths', async () => {
    const remote = await POST(jsonReq({ source: 'url', value: 'https://t.vndb.org/cv/99/990801.jpg' }), ctx());
    expect(remote.status).toBe(200);
    expect((await remote.json()).cover).toBe('https://t.vndb.org/cv/99/990801.jpg');

    const local = await POST(jsonReq({ source: 'release', value: 'releases/front.jpg' }), ctx());
    expect(local.status).toBe(200);
    expect((await local.json()).cover).toBe('releases/front.jpg');
    expect(getCollectionItem(VN_ID)?.custom_cover).toBe('releases/front.jpg');
  });

  it('accepts JSON requests without an explicit content type', async () => {
    const res = await POST(jsonReqWithoutContentType({ source: 'path', value: 'cover/front.jpg' }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).cover).toBe('cover/front.jpg');
  });

  it('rejects empty POST bodies with no content type as an invalid source', async () => {
    const res = await POST(emptyPostReq(), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid source' });
  });

  it('rejects non-allowlisted remote URLs', async () => {
    const res = await POST(jsonReq({ source: 'url', value: 'http://127.0.0.1/private.jpg' }), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid url' });
  });
});

describe('POST /api/collection/[id]/cover multipart uploads', () => {
  it('rejects uploads from the content-length precheck', async () => {
    const res = await POST(
      multipartReq('--x--', {
        'content-type': 'multipart/form-data; boundary=x',
        'content-length': String(MAX_COVER_BYTES + 1),
      }),
      ctx(),
    );
    expect(res.status).toBe(413);
  });

  it('rejects uploads that cross the streaming body limit', async () => {
    reparseWithLimitMock.mockRejectedValue(new PayloadTooLargeError(MAX_COVER_BYTES));
    const form = new FormData();
    form.set('file', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'cover.jpg', { type: 'image/jpeg' }));
    const res = await POST(formReq(form), ctx());
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'file too large (max 10MB)' });
  });

  it('rethrows unexpected multipart parser failures', async () => {
    reparseWithLimitMock.mockRejectedValue(new Error('parser failed'));
    const form = new FormData();
    form.set('file', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'cover.jpg', { type: 'image/jpeg' }));
    await expect(POST(formReq(form), ctx())).rejects.toThrow('parser failed');
  });

  it('rejects malformed multipart bodies and missing file fields', async () => {
    reparseWithLimitMock.mockResolvedValueOnce(new Request(`http://127.0.0.1/api/collection/${VN_ID}/cover`, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=bad' },
      body: 'not multipart',
    }));
    const malformed = await POST(formReq(new FormData()), ctx());
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'invalid form data' });

    const missing = await POST(formReq(new FormData()), ctx());
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'missing file' });
  });

  it('rejects oversized File objects after multipart parsing', async () => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(MAX_COVER_BYTES + 1)], 'huge.jpg', { type: 'image/jpeg' }));
    const res = await POST(formReq(form), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'file too large (max 10MB)' });
  });

  it('maps unsupported uploaded file types to a stable image error', async () => {
    saveUploadMock.mockRejectedValue(new UnsupportedFileType('text/plain'));
    const form = new FormData();
    form.set('file', new File(['not an image'], 'cover.txt', { type: 'text/plain' }));
    const res = await POST(formReq(form), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'must be an image' });
  });

  it('rethrows unexpected cover storage failures', async () => {
    saveUploadMock.mockRejectedValue(new Error('storage failed'));
    const form = new FormData();
    form.set('file', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'cover.jpg', { type: 'image/jpeg' }));
    await expect(POST(formReq(form), ctx())).rejects.toThrow('storage failed');
  });

  it('stores uploaded covers returned by the file service', async () => {
    saveUploadMock.mockResolvedValue('uploads/cover.jpg');
    const form = new FormData();
    form.set('file', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'cover.jpg', { type: 'image/jpeg' }));
    const res = await POST(formReq(form), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).cover).toBe('uploads/cover.jpg');
    expect(saveUploadMock).toHaveBeenCalledWith('vnCover', expect.any(File), VN_ID);
  });
});
