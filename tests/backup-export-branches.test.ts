import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  backup: vi.fn(),
  createReadStream: vi.fn(),
  mkdtemp: vi.fn(),
  recordActivity: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdtemp: mocks.mkdtemp,
  rm: mocks.rm,
  stat: mocks.stat,
  unlink: mocks.unlink,
}));

vi.mock('node:fs', () => ({
  createReadStream: mocks.createReadStream,
}));

vi.mock('@/lib/db', () => ({
  db: { backup: mocks.backup },
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: mocks.recordActivity,
}));

import { GET } from '@/app/api/backup/route';

function request(): Request {
  return new Request('http://127.0.0.1/api/backup');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.backup.mockResolvedValue(undefined);
  mocks.createReadStream.mockReturnValue(Readable.from([Buffer.from('SQLite format 3\0')]));
  mocks.mkdtemp.mockResolvedValue('/tmp/vndb-backup-test');
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.rm.mockResolvedValue(undefined);
  mocks.stat.mockResolvedValue({ size: 16 });
  mocks.unlink.mockResolvedValue(undefined);
});

describe('GET /api/backup export branches', () => {
  it('returns the auth gate response without creating a temp backup', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValue(denied);

    const response = await GET(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    expect(mocks.mkdtemp).not.toHaveBeenCalled();
  });

  it('cleans the temp directory when SQLite backup fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.backup.mockRejectedValue(new Error('disk full'));

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'backup failed' });
    expect(mocks.rm).toHaveBeenCalledWith('/tmp/vndb-backup-test', { recursive: true, force: true });
    expect(error).toHaveBeenCalledWith('[backup] SQLite backup failed:', 'disk full');
    error.mockRestore();
  });

  it('swallows temp directory cleanup failures after SQLite backup failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.backup.mockRejectedValue(new Error('disk full'));
    mocks.rm.mockRejectedValue(new Error('cleanup failed'));

    const response = await GET(request());
    await Promise.resolve();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'backup failed' });
    expect(mocks.rm).toHaveBeenCalledWith('/tmp/vndb-backup-test', { recursive: true, force: true });
    error.mockRestore();
  });

  it('cleans the temp directory when the snapshot cannot be statted', async () => {
    mocks.stat.mockRejectedValue(new Error('missing'));

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'backup file not found after write' });
    expect(mocks.rm).toHaveBeenCalledWith('/tmp/vndb-backup-test', { recursive: true, force: true });
  });

  it('destroys and unlinks the stream target when web-stream conversion fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stream = {
      destroy: vi.fn(),
      off: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
    };
    mocks.createReadStream.mockReturnValue(stream);

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'backup failed' });
    expect(stream.off).toHaveBeenCalledWith('close', expect.any(Function));
    expect(stream.off).toHaveBeenCalledWith('error', expect.any(Function));
    expect(stream.destroy).toHaveBeenCalled();
    expect(mocks.unlink).toHaveBeenCalledWith('/tmp/vndb-backup-test/snapshot.db');
    expect(error).toHaveBeenCalledWith('[backup] stream conversion failed:', expect.any(String));
    error.mockRestore();
  });

  it('swallows snapshot unlink failures during stream conversion cleanup', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stream = {
      destroy: vi.fn(),
      off: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
    };
    mocks.createReadStream.mockReturnValue(stream);
    mocks.unlink.mockRejectedValue(new Error('unlink failed'));

    const response = await GET(request());
    await Promise.resolve();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'backup failed' });
    expect(mocks.unlink).toHaveBeenCalledWith('/tmp/vndb-backup-test/snapshot.db');
    error.mockRestore();
  });
});
