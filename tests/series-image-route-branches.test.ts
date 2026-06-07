import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockPayloadTooLargeError extends Error {}
  class MockUnsupportedFileType extends Error {}

  return {
    getSeries: vi.fn(),
    recordActivity: vi.fn(),
    requireLocalhostOrToken: vi.fn(),
    reparseWithLimit: vi.fn(),
    saveUpload: vi.fn(),
    updateSeries: vi.fn(),
    PayloadTooLargeError: MockPayloadTooLargeError,
    UnsupportedFileType: MockUnsupportedFileType,
  };
});

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/db', () => ({
  getSeries: mocks.getSeries,
  updateSeries: mocks.updateSeries,
}));

vi.mock('@/lib/files', () => ({
  saveUpload: mocks.saveUpload,
  UnsupportedFileType: mocks.UnsupportedFileType,
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: mocks.recordActivity,
}));

vi.mock('@/lib/read-limited-body', () => ({
  PayloadTooLargeError: mocks.PayloadTooLargeError,
  reparseWithLimit: mocks.reparseWithLimit,
}));

import { POST } from '@/app/api/series/[id]/image/route';

const MAX_SERIES_IMAGE_BYTES = 15 * 1024 * 1024;

type FormFields = {
  file?: File | null;
  kind?: string | null;
  formDataThrows?: boolean;
};

class HugeFile extends File {
  get size(): number {
    return MAX_SERIES_IMAGE_BYTES + 1;
  }
}

function ctx(id = '7'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function req(headers: Record<string, string> = { 'content-type': 'multipart/form-data' }): NextRequest {
  return new NextRequest('http://127.0.0.1/api/series/7/image', {
    method: 'POST',
    headers,
    body: '',
  });
}

function reqWithoutBody(): NextRequest {
  return new NextRequest('http://127.0.0.1/api/series/7/image', {
    method: 'POST',
  });
}

function boundedRequest(fields: FormFields): Request {
  const form = new FormData();
  if (fields.file) form.set('file', fields.file);
  if (fields.kind !== undefined && fields.kind !== null) form.set('kind', fields.kind);
  const request = new Request('http://127.0.0.1/api/series/7/image', { method: 'POST' });
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
  mocks.getSeries.mockReturnValue({ id: 7, name: 'Series Fixture' });
  mocks.reparseWithLimit.mockResolvedValue(boundedRequest({
    file: new File(['image'], 'cover.png', { type: 'image/png' }),
    kind: 'cover',
  }));
  mocks.saveUpload.mockResolvedValue('series/7-cover.png');
});

describe('POST /api/series/[id]/image route branches', () => {
  it('returns the auth gate response before parsing upload data', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValue(denied);
    const response = await POST(req(), ctx());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    expect(mocks.reparseWithLimit).not.toHaveBeenCalled();
  });

  it('rejects declared payloads above the image limit before parsing multipart data', async () => {
    const response = await POST(req({
      'content-type': 'multipart/form-data',
      'content-length': String(MAX_SERIES_IMAGE_BYTES + 1),
    }), ctx());
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'payload too large (15.0 MB, max 15.0 MB)',
    });
  });

  it('rejects invalid series ids', async () => {
    const response = await POST(req(), ctx('bad'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid id' });
  });

  it('returns not found when the series row does not exist', async () => {
    mocks.getSeries.mockReturnValue(null);
    const response = await POST(req(), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not found' });
  });

  it('rejects non-multipart requests', async () => {
    const response = await POST(req({ 'content-type': 'application/json' }), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'expected multipart/form-data' });

    const missingHeaderResponse = await POST(req({}), ctx());
    expect(missingHeaderResponse.status).toBe(400);
    await expect(missingHeaderResponse.json()).resolves.toEqual({ error: 'expected multipart/form-data' });

    const noBodyResponse = await POST(reqWithoutBody(), ctx());
    expect(noBodyResponse.status).toBe(400);
    await expect(noBodyResponse.json()).resolves.toEqual({ error: 'expected multipart/form-data' });
  });

  it('maps reparse limit failures to the upload-specific 413 response', async () => {
    mocks.reparseWithLimit.mockRejectedValue(new mocks.PayloadTooLargeError('too large'));
    const response = await POST(req(), ctx());
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'file too large (max 15MB)' });
  });

  it('rethrows unexpected request reparse failures', async () => {
    mocks.reparseWithLimit.mockRejectedValue(new Error('unexpected reparse failure'));
    await expect(POST(req(), ctx())).rejects.toThrow('unexpected reparse failure');
  });

  it('rejects malformed multipart form data', async () => {
    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({ formDataThrows: true }));
    const response = await POST(req(), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid form data' });
  });

  it('rejects missing or unknown image kind values', async () => {
    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({
      file: new File(['image'], 'cover.png', { type: 'image/png' }),
    }));
    const missingResponse = await POST(req(), ctx());
    expect(missingResponse.status).toBe(400);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'kind must be banner or cover' });

    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({
      file: new File(['image'], 'cover.png', { type: 'image/png' }),
      kind: 'avatar',
    }));
    const unknownResponse = await POST(req(), ctx());
    expect(unknownResponse.status).toBe(400);
    await expect(unknownResponse.json()).resolves.toEqual({ error: 'kind must be banner or cover' });
  });

  it('rejects missing and oversized files', async () => {
    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({ kind: 'cover' }));
    const missingResponse = await POST(req(), ctx());
    expect(missingResponse.status).toBe(400);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'missing file' });

    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({
      file: new HugeFile(['image'], 'huge.png', { type: 'image/png' }),
      kind: 'cover',
    }));
    const oversizedResponse = await POST(req(), ctx());
    expect(oversizedResponse.status).toBe(400);
    await expect(oversizedResponse.json()).resolves.toEqual({ error: 'file too large (max 15MB)' });
  });

  it('rejects unsupported uploaded file types', async () => {
    mocks.saveUpload.mockRejectedValue(new mocks.UnsupportedFileType('bad type'));
    const response = await POST(req(), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'must be an image' });
  });

  it('rethrows unexpected upload persistence failures', async () => {
    mocks.saveUpload.mockRejectedValue(new Error('unexpected persistence failure'));
    await expect(POST(req(), ctx())).rejects.toThrow('unexpected persistence failure');
  });

  it('stores uploaded cover images and records activity', async () => {
    const response = await POST(req(), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ path: 'series/7-cover.png' });
    expect(mocks.saveUpload).toHaveBeenCalledWith('seriesCover', expect.any(File), '7-cover');
    expect(mocks.updateSeries).toHaveBeenCalledWith(7, { cover_path: 'series/7-cover.png' });
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'series.image-upload',
      entity: 'series',
      entityId: '7',
      label: 'Uploaded series cover',
      payload: { kind: 'cover', bytes: 5 },
    });
  });

  it('stores uploaded banner images even when activity logging fails', async () => {
    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({
      file: new File(['banner'], 'banner.png', { type: 'image/png' }),
      kind: 'banner',
    }));
    mocks.saveUpload.mockResolvedValue('series/7-banner.png');
    mocks.recordActivity.mockImplementation(() => {
      throw new Error('activity failed');
    });
    const response = await POST(req(), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ path: 'series/7-banner.png' });
    expect(mocks.updateSeries).toHaveBeenCalledWith(7, { banner_path: 'series/7-banner.png' });
  });
});
