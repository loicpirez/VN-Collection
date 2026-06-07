import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockPayloadTooLargeError extends Error {}

  return {
    decodeCollectionImportPayload: vi.fn(),
    importData: vi.fn(),
    readBodyWithLimit: vi.fn(),
    recordActivity: vi.fn(),
    reparseWithLimit: vi.fn(),
    requireLocalhostOrToken: vi.fn(),
    PayloadTooLargeError: MockPayloadTooLargeError,
  };
});

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/read-limited-body', () => ({
  PayloadTooLargeError: mocks.PayloadTooLargeError,
  readBodyWithLimit: mocks.readBodyWithLimit,
  reparseWithLimit: mocks.reparseWithLimit,
}));

vi.mock('@/lib/collection-import', () => ({
  decodeCollectionImportPayload: mocks.decodeCollectionImportPayload,
}));

vi.mock('@/lib/db', () => ({
  importData: mocks.importData,
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: mocks.recordActivity,
}));

import { POST } from '@/app/api/collection/import/route';

const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

type ImportPayload = {
  version: 2;
  exported_at: number;
  vns: [];
  collection: [];
  series: [];
  series_vn: [];
};

class HugeFile extends File {
  get size(): number {
    return MAX_IMPORT_BYTES + 1;
  }
}

function validPayload(): ImportPayload {
  return {
    version: 2,
    exported_at: 1,
    vns: [],
    collection: [],
    series: [],
    series_vn: [],
  };
}

function jsonRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://127.0.0.1/api/collection/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

function noContentTypeRequest(): NextRequest {
  return new NextRequest('http://127.0.0.1/api/collection/import', {
    method: 'POST',
  });
}

function multipartRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://127.0.0.1/api/collection/import', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data', ...headers },
    body: '',
  });
}

function boundedMultipartRequest(file: File | null): Request {
  const form = new FormData();
  if (file) form.set('file', file);
  const req = new Request('http://127.0.0.1/api/collection/import', { method: 'POST' });
  Object.defineProperty(req, 'formData', {
    value: async () => form,
  });
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.readBodyWithLimit.mockResolvedValue(Buffer.from(JSON.stringify(validPayload())));
  mocks.reparseWithLimit.mockResolvedValue(boundedMultipartRequest(new File([JSON.stringify(validPayload())], 'backup.json')));
  mocks.decodeCollectionImportPayload.mockReturnValue({ ok: true, value: validPayload() });
  mocks.importData.mockReturnValue({ vns: 0, collection: 0 });
});

describe('POST /api/collection/import route branches', () => {
  it('returns the auth gate response before reading the request body', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValue(denied);
    const response = await POST(jsonRequest('{}'));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    expect(mocks.readBodyWithLimit).not.toHaveBeenCalled();
  });

  it('rejects chunked imports without an explicit content length', async () => {
    const response = await POST(jsonRequest('{}', { 'transfer-encoding': 'chunked' }));
    expect(response.status).toBe(411);
    await expect(response.json()).resolves.toEqual({
      error: 'Content-Length required (chunked transfer not accepted for import)',
    });
  });

  it('rejects declared JSON payloads above the import limit before parsing', async () => {
    const response = await POST(jsonRequest('{}', { 'content-length': String(MAX_IMPORT_BYTES + 1) }));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'payload too large (100.0 MB, max 100 MB)',
    });
  });

  it('maps streaming JSON body limit failures to a 413 response', async () => {
    mocks.readBodyWithLimit.mockRejectedValue(new mocks.PayloadTooLargeError('too large'));
    const response = await POST(jsonRequest('{}'));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'payload too large' });
  });

  it('accepts present but non-oversized content length headers before parsing JSON', async () => {
    const response = await POST(jsonRequest(JSON.stringify(validPayload()), { 'content-length': 'not-a-number' }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, summary: { vns: 0, collection: 0 } });
  });

  it('treats a missing content type as a raw JSON body', async () => {
    const response = await POST(noContentTypeRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, summary: { vns: 0, collection: 0 } });
  });

  it('rejects malformed JSON bodies before decoding the import contract', async () => {
    mocks.readBodyWithLimit.mockResolvedValue(Buffer.from('{'));
    const response = await POST(jsonRequest('{'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid JSON' });
    expect(mocks.decodeCollectionImportPayload).not.toHaveBeenCalled();
  });

  it('logs non-Error parse failures with a sanitized invalid JSON response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.readBodyWithLimit.mockRejectedValue('parser failed');
    const response = await POST(jsonRequest('{}'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid JSON' });
    expect(consoleSpy).toHaveBeenCalledWith('[collection/import] JSON parse failed:', 'parser failed');
    consoleSpy.mockRestore();
  });

  it('returns decoder validation errors without calling importData', async () => {
    mocks.decodeCollectionImportPayload.mockReturnValue({ ok: false, error: 'collection[0].status is invalid' });
    const response = await POST(jsonRequest(JSON.stringify(validPayload())));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'collection[0].status is invalid' });
    expect(mocks.importData).not.toHaveBeenCalled();
  });

  it('records activity and returns the import summary after a valid JSON import', async () => {
    mocks.importData.mockReturnValue({ vns: 2, collection: 1 });
    const response = await POST(jsonRequest(JSON.stringify(validPayload())));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, summary: { vns: 2, collection: 1 } });
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'collection.import',
      entity: 'collection',
      entityId: 'all',
      label: 'Collection import',
      payload: { vns: 2, collection: 1 },
    });
  });

  it('maps importData failures to a 500 response', async () => {
    mocks.importData.mockImplementation(() => {
      throw new Error('write failed');
    });
    const response = await POST(jsonRequest(JSON.stringify(validPayload())));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'import failed' });
  });

  it('rejects multipart imports when the file field is missing', async () => {
    mocks.reparseWithLimit.mockResolvedValue(boundedMultipartRequest(null));
    const response = await POST(multipartRequest());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'missing file' });
  });

  it('rejects multipart imports when the file object exceeds the import limit', async () => {
    mocks.reparseWithLimit.mockResolvedValue(boundedMultipartRequest(new HugeFile(['{}'], 'huge.json')));
    const response = await POST(multipartRequest());
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'file too large' });
  });

  it('maps multipart reparse limit failures to a 413 response', async () => {
    mocks.reparseWithLimit.mockRejectedValue(new mocks.PayloadTooLargeError('too large'));
    const response = await POST(multipartRequest());
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'payload too large' });
  });

  it('imports valid multipart JSON files', async () => {
    mocks.importData.mockReturnValue({ vns: 1, collection: 1 });
    mocks.reparseWithLimit.mockResolvedValue(boundedMultipartRequest(new File([JSON.stringify(validPayload())], 'backup.json')));
    const response = await POST(multipartRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, summary: { vns: 1, collection: 1 } });
  });
});
