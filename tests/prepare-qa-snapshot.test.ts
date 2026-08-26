import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareQaSnapshot } from '../scripts/prepare-qa-snapshot';

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'vndb-qa-snapshot-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('prepareQaSnapshot', () => {
  it('copies committed WAL data and replaces stale destination sidecars', async () => {
    const root = temporaryRoot();
    const sourcePath = join(root, 'data', 'collection.db');
    const targetPath = join(root, '.qa', 'data', 'collection.db');
    mkdirSync(join(root, 'data'), { recursive: true });
    mkdirSync(join(root, '.qa', 'data'), { recursive: true });

    const source = new Database(sourcePath);
    source.pragma('journal_mode = WAL');
    source.exec('CREATE TABLE sample (value TEXT NOT NULL)');
    source.prepare('INSERT INTO sample (value) VALUES (?)').run('committed-in-wal');
    writeFileSync(targetPath, 'stale');
    writeFileSync(`${targetPath}-wal`, 'stale');
    writeFileSync(`${targetPath}-shm`, 'stale');

    try {
      await prepareQaSnapshot({ repoRoot: root, sourcePath, targetPath });
    } finally {
      source.close();
    }

    const snapshot = new Database(targetPath, { readonly: true });
    try {
      const row = snapshot.prepare<[], { value: string }>('SELECT value FROM sample').get();
      expect(row?.value).toBe('committed-in-wal');
      expect(snapshot.pragma('quick_check', { simple: true })).toBe('ok');
    } finally {
      snapshot.close();
    }
  });

  it('rejects a destination outside the repository QA directory', async () => {
    const root = temporaryRoot();
    const sourcePath = join(root, 'data', 'collection.db');
    mkdirSync(join(root, 'data'), { recursive: true });
    new Database(sourcePath).close();

    await expect(prepareQaSnapshot({
      repoRoot: root,
      sourcePath,
      targetPath: join(root, 'unsafe.db'),
    })).rejects.toThrow('must be inside');
  });

  it('rejects using the source database as the disposable destination', async () => {
    const root = temporaryRoot();
    const sourcePath = join(root, '.qa', 'collection.db');
    mkdirSync(join(root, '.qa'), { recursive: true });
    new Database(sourcePath).close();

    await expect(prepareQaSnapshot({ repoRoot: root, sourcePath, targetPath: sourcePath }))
      .rejects.toThrow('must be different');
  });
});
