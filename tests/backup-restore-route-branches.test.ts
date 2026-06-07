import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockPayloadTooLargeError extends Error {}

  return {
    recordActivity: vi.fn(),
    requireLocalhostOrToken: vi.fn(),
    reparseWithLimit: vi.fn(),
    restoreFromSqliteFile: vi.fn(),
    PayloadTooLargeError: MockPayloadTooLargeError,
  };
});

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/db', () => ({
  restoreFromSqliteFile: mocks.restoreFromSqliteFile,
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: mocks.recordActivity,
}));

vi.mock('@/lib/read-limited-body', () => ({
  PayloadTooLargeError: mocks.PayloadTooLargeError,
  reparseWithLimit: mocks.reparseWithLimit,
}));

import { POST } from '@/app/api/backup/restore/route';

const SQLITE_MAGIC = 'SQLite format 3\0';
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

type FormFields = {
  file?: File | null;
};

class HugeFile extends File {
  get size(): number {
    return MAX_UPLOAD_BYTES + 1;
  }
}

function sqliteFile(): File {
  return new File([SQLITE_MAGIC, new Uint8Array(64)], 'backup.db');
}

function req(headers: Record<string, string> = { 'content-type': 'multipart/form-data' }): NextRequest {
  return new NextRequest('http://127.0.0.1/api/backup/restore', {
    method: 'POST',
    headers,
    body: '',
  });
}

function boundedRequest(fields: FormFields): Request {
  const form = new FormData();
  if (fields.file) form.set('file', fields.file);
  const request = new Request('http://127.0.0.1/api/backup/restore', { method: 'POST' });
  Object.defineProperty(request, 'formData', {
    value: async () => form,
  });
  return request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.reparseWithLimit.mockResolvedValue(boundedRequest({ file: sqliteFile() }));
  mocks.restoreFromSqliteFile.mockResolvedValue({ tables: 2, rows: 50 });
});

describe('POST /api/backup/restore route branches', () => {
  it('returns the auth gate response before checking upload headers', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValue(denied);
    const response = await POST(req());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    expect(mocks.reparseWithLimit).not.toHaveBeenCalled();
  });

  it('rejects non-multipart requests and declared oversized uploads', async () => {
    const contentTypeResponse = await POST(req({ 'content-type': 'application/json' }));
    expect(contentTypeResponse.status).toBe(400);
    await expect(contentTypeResponse.json()).resolves.toEqual({ error: 'expected multipart/form-data' });

    const missingContentTypeResponse = await POST(new NextRequest('http://127.0.0.1/api/backup/restore', { method: 'POST' }));
    expect(missingContentTypeResponse.status).toBe(400);
    await expect(missingContentTypeResponse.json()).resolves.toEqual({ error: 'expected multipart/form-data' });

    const oversizedResponse = await POST(req({
      'content-type': 'multipart/form-data',
      'content-length': String(MAX_UPLOAD_BYTES + 1),
    }));
    expect(oversizedResponse.status).toBe(413);
    await expect(oversizedResponse.json()).resolves.toEqual({
      error: 'payload too large (1024.0 MB, max 1024.0 MB)',
    });
  });

  it('maps streaming body limit failures to a 413 response', async () => {
    mocks.reparseWithLimit.mockRejectedValue(new mocks.PayloadTooLargeError('too large'));
    const response = await POST(req());
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: `file too large (max ${MAX_UPLOAD_BYTES} bytes)` });
  });

  it('rethrows non-size body reparse failures', async () => {
    mocks.reparseWithLimit.mockRejectedValue(new Error('multipart parser crashed'));
    await expect(POST(req())).rejects.toThrow('multipart parser crashed');
  });

  it('rejects missing, oversized, and non-SQLite files', async () => {
    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({}));
    const missingResponse = await POST(req());
    expect(missingResponse.status).toBe(400);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'missing file' });

    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({
      file: new HugeFile([SQLITE_MAGIC], 'huge.db'),
    }));
    const oversizedResponse = await POST(req());
    expect(oversizedResponse.status).toBe(413);
    await expect(oversizedResponse.json()).resolves.toEqual({
      error: `file too large (${MAX_UPLOAD_BYTES + 1} > ${MAX_UPLOAD_BYTES})`,
    });

    mocks.reparseWithLimit.mockResolvedValue(boundedRequest({
      file: new File(['not sqlite'], 'backup.db'),
    }));
    const magicResponse = await POST(req());
    expect(magicResponse.status).toBe(400);
    await expect(magicResponse.json()).resolves.toEqual({ error: 'file is not a SQLite database' });
  });

  it('restores a valid SQLite backup and records activity', async () => {
    const response = await POST(req());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, summary: { tables: 2, rows: 50 } });
    expect(mocks.restoreFromSqliteFile).toHaveBeenCalledWith(expect.any(Buffer));
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'backup.restore',
      entity: 'backup',
      entityId: 'sqlite',
      label: 'SQLite backup restore',
      payload: { tables: 2, rows: 50 },
    });
  });

  it('returns a generic restore failure when the DB restore throws', async () => {
    mocks.restoreFromSqliteFile.mockRejectedValue(new Error('restore failed'));
    const response = await POST(req());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'restore failed' });
  });
});
