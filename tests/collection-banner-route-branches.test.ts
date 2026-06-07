import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockPayloadTooLargeError extends Error {}
  class MockUnsupportedFileType extends Error {}

  return {
    getCollectionItem: vi.fn(),
    isAllowedHttpTarget: vi.fn(),
    isValidImageSourceValue: vi.fn(),
    normalizeRotation: vi.fn(),
    recordActivity: vi.fn(),
    readBodyWithLimit: vi.fn(),
    requireLocalhostOrToken: vi.fn(),
    reparseWithLimit: vi.fn(),
    saveUpload: vi.fn(),
    setBanner: vi.fn(),
    setBannerPosition: vi.fn(),
    setBannerRotation: vi.fn(),
    transaction: vi.fn(),
    PayloadTooLargeError: MockPayloadTooLargeError,
    UnsupportedFileType: MockUnsupportedFileType,
  };
});

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/db', () => ({
  db: { transaction: mocks.transaction },
  getCollectionItem: mocks.getCollectionItem,
  normalizeRotation: mocks.normalizeRotation,
  setBanner: mocks.setBanner,
  setBannerPosition: mocks.setBannerPosition,
  setBannerRotation: mocks.setBannerRotation,
}));

vi.mock('@/lib/files', () => ({
  isValidImageSourceValue: mocks.isValidImageSourceValue,
  saveUpload: mocks.saveUpload,
  UnsupportedFileType: mocks.UnsupportedFileType,
}));

vi.mock('@/lib/url-allowlist', () => ({
  isAllowedHttpTarget: mocks.isAllowedHttpTarget,
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: mocks.recordActivity,
}));

vi.mock('@/lib/read-limited-body', () => ({
  PayloadTooLargeError: mocks.PayloadTooLargeError,
  readBodyWithLimit: mocks.readBodyWithLimit,
  reparseWithLimit: mocks.reparseWithLimit,
}));

import {
  DELETE,
  PATCH,
  POST,
} from '@/app/api/collection/[id]/banner/route';

const VN_ID = 'v990401';
const MAX_BANNER_BYTES = 15 * 1024 * 1024;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type Body = Record<string, JsonValue>;
type Item = {
  id: string;
  custom_cover: string | null;
  local_image: string | null;
  image_url: string | null;
};
type FormFields = {
  file?: File | null;
  formDataThrows?: boolean;
};

class HugeFile extends File {
  get size(): number {
    return MAX_BANNER_BYTES + 1;
  }
}

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: VN_ID,
    custom_cover: 'cover/custom.png',
    local_image: 'vn/local.jpg',
    image_url: 'https://t.vndb.org/cv/99/990401.jpg',
    ...overrides,
  };
}

function ctx(id = VN_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function jsonReq(body: Body): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/collection/${VN_ID}/banner`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function jsonReqWithoutContentType(body: Body): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/collection/${VN_ID}/banner`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function emptyPostReq(): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/collection/${VN_ID}/banner`, { method: 'POST' });
}

function patchReq(body: Body): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/collection/${VN_ID}/banner`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/collection/${VN_ID}/banner`, { method: 'DELETE' });
}

function multipartReq(headers: Record<string, string> = { 'content-type': 'multipart/form-data' }): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/collection/${VN_ID}/banner`, {
    method: 'POST',
    headers,
    body: '',
  });
}

function boundedRequest(fields: FormFields): Request {
  const form = new FormData();
  if (fields.file) form.set('file', fields.file);
  const request = new Request(`http://127.0.0.1/api/collection/${VN_ID}/banner`, { method: 'POST' });
  Object.defineProperty(request, 'formData', {
    value: fields.formDataThrows
      ? async () => {
        throw new Error('bad form');
      }
      : async () => form,
  });
  return request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.getCollectionItem.mockReturnValue(item());
  mocks.isAllowedHttpTarget.mockReturnValue(true);
  mocks.isValidImageSourceValue.mockImplementation((value: string) => !value.includes('invalid'));
  mocks.normalizeRotation.mockImplementation((value: number) => value % 360);
  mocks.readBodyWithLimit.mockImplementation(async (request: Request) => Buffer.from(await request.arrayBuffer()));
  mocks.reparseWithLimit.mockResolvedValue(boundedRequest({
    file: new File(['banner'], 'banner.png', { type: 'image/png' }),
  }));
  mocks.saveUpload.mockResolvedValue('cover/v990401-banner.png');
  mocks.transaction.mockImplementation((fn: () => void) => fn);
});

describe('POST /api/collection/[id]/banner JSON branches', () => {
  it('returns the auth gate response before validating the route id', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValue(denied);
    const response = await POST(jsonReq({ source: 'cover' }), ctx());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
  });

  it('rejects invalid ids and missing collection rows', async () => {
    const invalidResponse = await POST(jsonReq({ source: 'cover' }), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.getCollectionItem.mockReturnValue(null);
    const missingResponse = await POST(jsonReq({ source: 'cover' }), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it.each([
    [{ source: 'cover' }, 'cover/custom.png'],
    [{ source: 'custom_cover' }, 'cover/custom.png'],
    [{ source: 'url', value: 'https://t.vndb.org/cv/99/990401.jpg' }, 'https://t.vndb.org/cv/99/990401.jpg'],
    [{ source: 'screenshot', value: 'vn-sc/screen.jpg' }, 'vn-sc/screen.jpg'],
    [{ source: 'release', value: 'vn-sc/release.jpg' }, 'vn-sc/release.jpg'],
    [{ source: 'path', value: 'cover/manual.jpg' }, 'cover/manual.jpg'],
  ] satisfies Array<[Body, string]>)('stores banner source %j', async (body, expected) => {
    const response = await POST(jsonReq(body), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ item: item(), banner: expected });
    expect(mocks.setBanner).toHaveBeenCalledWith(VN_ID, expected);
  });

  it('uses local or remote cover fallback when no custom cover exists', async () => {
    mocks.getCollectionItem.mockReturnValue(item({ custom_cover: null }));
    const localResponse = await POST(jsonReq({ source: 'cover' }), ctx());
    expect(localResponse.status).toBe(200);
    await expect(localResponse.json()).resolves.toEqual({ item: item({ custom_cover: null }), banner: 'vn/local.jpg' });

    mocks.getCollectionItem.mockReturnValue(item({ custom_cover: null, local_image: null }));
    const remoteResponse = await POST(jsonReq({ source: 'cover' }), ctx());
    expect(remoteResponse.status).toBe(200);
    await expect(remoteResponse.json()).resolves.toEqual({
      item: item({ custom_cover: null, local_image: null }),
      banner: 'https://t.vndb.org/cv/99/990401.jpg',
    });
  });

  it('accepts JSON requests without an explicit content type and clears missing custom covers', async () => {
    mocks.getCollectionItem.mockReturnValue(item({ custom_cover: null }));
    const response = await POST(jsonReqWithoutContentType({ source: 'custom_cover' }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ item: item({ custom_cover: null }), banner: null });
    expect(mocks.setBanner).toHaveBeenCalledWith(VN_ID, null);
  });

  it('rejects empty POST bodies with no content type as an invalid source', async () => {
    const response = await POST(emptyPostReq(), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid source' });
  });

  it('rejects invalid URL, path, source, and resolved image values', async () => {
    mocks.isAllowedHttpTarget.mockReturnValue(false);
    const urlResponse = await POST(jsonReq({ source: 'url', value: 'https://example.invalid/banner.jpg' }), ctx());
    expect(urlResponse.status).toBe(400);
    await expect(urlResponse.json()).resolves.toEqual({ error: 'invalid url' });

    const pathResponse = await POST(jsonReq({ source: 'path', value: 'invalid/path.jpg' }), ctx());
    expect(pathResponse.status).toBe(400);
    await expect(pathResponse.json()).resolves.toEqual({ error: 'invalid path' });

    const sourceResponse = await POST(jsonReq({ source: 'bad' }), ctx());
    expect(sourceResponse.status).toBe(400);
    await expect(sourceResponse.json()).resolves.toEqual({ error: 'invalid source' });

    mocks.isAllowedHttpTarget.mockReturnValue(true);
    mocks.getCollectionItem.mockReturnValue(item({ custom_cover: null, local_image: null, image_url: 'invalid://cover' }));
    const resolvedResponse = await POST(jsonReq({ source: 'cover' }), ctx());
    expect(resolvedResponse.status).toBe(400);
    await expect(resolvedResponse.json()).resolves.toEqual({ error: 'invalid image source' });
  });
});

describe('POST /api/collection/[id]/banner multipart branches', () => {
  it('rejects declared upload payloads above the banner limit', async () => {
    const response = await POST(multipartReq({
      'content-type': 'multipart/form-data',
      'content-length': String(MAX_BANNER_BYTES + 1),
    }), ctx());
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'payload too large (15.0 MB, max 15.0 MB)',
    });
  });

  it('maps multipart body limit failures to a 413 response', async () => {
    mocks.reparseWithLimit.mockRejectedValue(new mocks.PayloadTooLargeError('too large'));
    const response = await POST(multipartReq(), ctx());
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'file too large (max 15MB)' });
  });

  it('rethrows unexpected multipart parser failures', async () => {
    mocks.reparseWithLimit.mockRejectedValue(new Error('parser failed'));
    await expect(POST(multipartReq(), ctx())).rejects.toThrow('parser failed');
  });

  it('rejects malformed multipart data, missing files, and oversized files', async () => {
    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({ formDataThrows: true }));
    const invalidResponse = await POST(multipartReq(), ctx());
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid form data' });

    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({}));
    const missingResponse = await POST(multipartReq(), ctx());
    expect(missingResponse.status).toBe(400);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'missing file' });

    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({
      file: new HugeFile(['banner'], 'huge.png', { type: 'image/png' }),
    }));
    const oversizedResponse = await POST(multipartReq(), ctx());
    expect(oversizedResponse.status).toBe(400);
    await expect(oversizedResponse.json()).resolves.toEqual({ error: 'file too large (max 15MB)' });
  });

  it('rejects unsupported uploaded banner file types', async () => {
    mocks.saveUpload.mockRejectedValue(new mocks.UnsupportedFileType('bad type'));
    const response = await POST(multipartReq(), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'must be an image' });
  });

  it('rethrows unexpected banner storage failures', async () => {
    mocks.saveUpload.mockRejectedValue(new Error('storage failed'));
    await expect(POST(multipartReq(), ctx())).rejects.toThrow('storage failed');
  });

  it('saves uploaded banners and records activity', async () => {
    const response = await POST(multipartReq(), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ item: item(), banner: 'cover/v990401-banner.png' });
    expect(mocks.saveUpload).toHaveBeenCalledWith('vnCover', expect.any(File), `${VN_ID}-banner`);
    expect(mocks.setBanner).toHaveBeenCalledWith(VN_ID, 'cover/v990401-banner.png');
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'banner.set',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Uploaded banner',
      payload: { source: 'upload' },
    });
  });
});

describe('PATCH /api/collection/[id]/banner branches', () => {
  it('rejects auth, invalid ids, and missing collection rows', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await PATCH(patchReq({ position: '50% 50%' }), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await PATCH(patchReq({ position: '50% 50%' }), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.getCollectionItem.mockReturnValue(null);
    const missingResponse = await PATCH(patchReq({ position: '50% 50%' }), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it('validates missing, malformed position, and malformed rotation payloads', async () => {
    const missingResponse = await PATCH(patchReq({}), ctx());
    expect(missingResponse.status).toBe(400);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'missing position or rotation' });

    const positionResponse = await PATCH(patchReq({ position: 'center' }), ctx());
    expect(positionResponse.status).toBe(400);
    await expect(positionResponse.json()).resolves.toEqual({ error: 'position must be "X% Y%" or null' });

    const rotationResponse = await PATCH(patchReq({ rotation: '90' }), ctx());
    expect(rotationResponse.status).toBe(400);
    await expect(rotationResponse.json()).resolves.toEqual({ error: 'rotation must be a number' });
  });

  it('updates position and normalized rotation in one transaction', async () => {
    mocks.normalizeRotation.mockReturnValue(90);
    const response = await PATCH(patchReq({ position: '40% 60%', rotation: 450 }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ item: item() });
    expect(mocks.setBannerPosition).toHaveBeenCalledWith(VN_ID, '40% 60%');
    expect(mocks.setBannerRotation).toHaveBeenCalledWith(VN_ID, 90);
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'banner.position',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Updated banner position',
      payload: { position: '40% 60%' },
    });
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'banner.rotate',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Rotated banner',
      payload: { rotation: 90 },
    });
  });

  it('accepts null position as an explicit clear', async () => {
    const response = await PATCH(patchReq({ position: null }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ item: item() });
    expect(mocks.setBannerPosition).toHaveBeenCalledWith(VN_ID, null);
  });
});

describe('DELETE /api/collection/[id]/banner branches', () => {
  it('rejects auth, invalid ids, and missing collection rows', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await DELETE(deleteReq(), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await DELETE(deleteReq(), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.getCollectionItem.mockReturnValue(null);
    const missingResponse = await DELETE(deleteReq(), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it('clears banner source, position, and rotation in one transaction', async () => {
    const response = await DELETE(deleteReq(), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ item: item() });
    expect(mocks.setBanner).toHaveBeenCalledWith(VN_ID, null);
    expect(mocks.setBannerPosition).toHaveBeenCalledWith(VN_ID, null);
    expect(mocks.setBannerRotation).toHaveBeenCalledWith(VN_ID, 0);
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'banner.reset',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Reset banner',
    });
  });
});
