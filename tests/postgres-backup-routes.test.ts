import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockTooLargeError extends Error {}
  return {
    backup: vi.fn(),
    recordActivity: vi.fn(),
    requireLocalhostOrToken: vi.fn(),
    restore: vi.fn(),
    TooLargeError: MockTooLargeError,
  };
});

vi.mock('@/lib/db', () => ({ db: { backup: vi.fn() }, restoreFromSqliteFile: vi.fn() }));
vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: () => ({ backend: 'postgres' }),
}));
vi.mock('@/lib/db/backup', () => ({
  POSTGRES_BACKUP_CONTENT_TYPE: 'application/x-vndb-collection-backup',
  POSTGRES_BACKUP_MAX_BYTES: 4 * 1024 * 1024 * 1024,
  PostgresBackupTooLargeError: mocks.TooLargeError,
  createPostgresBackupDownload: mocks.backup,
  restorePostgresBackup: mocks.restore,
}));
vi.mock('@/lib/auth-gate', () => ({ requireLocalhostOrToken: mocks.requireLocalhostOrToken }));
vi.mock('@/lib/activity', () => ({ recordActivity: mocks.recordActivity }));

import { GET } from '@/app/api/backup/route';
import { POST } from '@/app/api/backup/restore/route';

const CONTENT_TYPE = 'application/x-vndb-collection-backup';
const MAX_BYTES = 4 * 1024 * 1024 * 1024;

function restoreRequest(options: { confirm?: boolean; contentType?: string; body?: string; length?: number } = {}): NextRequest {
  const headers = new Headers();
  if (options.confirm !== false) headers.set('x-vncoll-restore-confirm', 'RESTORE');
  if (options.contentType !== '') headers.set('content-type', options.contentType ?? CONTENT_TYPE);
  if (options.length !== undefined) headers.set('content-length', String(options.length));
  return new NextRequest('http://127.0.0.1/api/backup/restore', {
    method: 'POST',
    headers,
    body: options.body === undefined ? 'logical backup' : options.body || undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.backup.mockResolvedValue({
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('backup'));
        controller.close();
      },
    }),
    filename: 'vndb-collection-2099-01-01.vncbackup',
    contentType: CONTENT_TYPE,
  });
  mocks.restore.mockResolvedValue({
    tables: [{ name: 'vn', rows_replaced: 3 }, { name: 'collection', rows_replaced: 2 }],
    skipped: [],
  });
});

describe('PostgreSQL backup routes', () => {
  it('streams an authenticated logical backup with safe attachment headers', async () => {
    const response = await GET(new Request('http://127.0.0.1/api/backup'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(CONTENT_TYPE);
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="vndb-collection-2099-01-01.vncbackup"');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe('backup');
    expect(mocks.recordActivity).toHaveBeenCalledWith(expect.objectContaining({ label: 'PostgreSQL logical backup export' }));
  });

  it('returns the auth response and an opaque setup failure', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const blocked = await GET(new Request('http://example.test/api/backup'));
    expect(blocked.status).toBe(403);
    expect(mocks.backup).not.toHaveBeenCalled();

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.backup.mockRejectedValueOnce(new Error('sensitive connection detail'));
    const failed = await GET(new Request('http://127.0.0.1/api/backup'));
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({ error: 'backup failed' });
    expect(error).toHaveBeenCalledWith('[backup] PostgreSQL backup failed:', 'sensitive connection detail');
    error.mockRestore();
  });

  it('requires explicit destructive confirmation, content type, body, and bounded length', async () => {
    const confirm = await POST(restoreRequest({ confirm: false }));
    expect(confirm.status).toBe(400);
    await expect(confirm.json()).resolves.toEqual({ error: 'restore confirmation required' });

    const contentType = await POST(restoreRequest({ contentType: 'application/octet-stream' }));
    expect(contentType.status).toBe(415);
    await expect(contentType.json()).resolves.toEqual({ error: 'expected a PostgreSQL logical backup' });

    const oversized = await POST(restoreRequest({ length: MAX_BYTES + 1 }));
    expect(oversized.status).toBe(413);

    const missing = await POST(restoreRequest({ body: '' }));
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({ error: 'missing backup body' });
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('restores a logical backup and records only aggregate integrity metadata', async () => {
    const response = await POST(restoreRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      summary: {
        tables: [{ name: 'vn', rows_replaced: 3 }, { name: 'collection', rows_replaced: 2 }],
        skipped: [],
      },
    });
    expect(mocks.restore).toHaveBeenCalledWith(expect.any(ReadableStream), MAX_BYTES);
    expect(mocks.recordActivity).toHaveBeenCalledWith(expect.objectContaining({
      entityId: 'postgres',
      payload: { tables: 2, rows: 5 },
    }));
  });

  it('maps streamed size failures and hides internal restore errors', async () => {
    mocks.restore.mockRejectedValueOnce(new mocks.TooLargeError('large'));
    const oversized = await POST(restoreRequest());
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toEqual({ error: `file too large (max ${MAX_BYTES} bytes)` });

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.restore.mockRejectedValueOnce(new Error('sensitive SQL detail'));
    const failed = await POST(restoreRequest());
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({ error: 'restore failed' });
    expect(error).toHaveBeenCalledWith('[backup/restore] PostgreSQL restore failed:', 'sensitive SQL detail');
    error.mockRestore();
  });
});
