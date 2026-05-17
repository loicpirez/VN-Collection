import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Vitest runs this BEFORE any test file is imported. We pin BOTH
// `DB_PATH` (the SQLite file) AND `STORAGE_ROOT` (the binary asset
// tree) to per-worker temp directories so the real `lib/db` and
// `lib/files` modules write to throwaway locations instead of
// clobbering the project's data/collection.db and data/storage/.
//
// The pinning is unconditional and runs before any module resolves
// the env. A failing test that bypasses the helpers and writes
// straight to `${process.cwd()}/data/...` will still touch the real
// tree — but every helper we ship reads these two env vars at
// import time, so the blast radius is bounded.
const tmp = mkdtempSync(join(tmpdir(), 'vndb-test-'));
process.env.DB_PATH = join(tmp, 'collection.db');
const storageTmp = join(tmp, 'storage');
mkdirSync(storageTmp, { recursive: true });
process.env.STORAGE_ROOT = storageTmp;

process.on('exit', () => {
  rmSync(tmp, { recursive: true, force: true });
});
