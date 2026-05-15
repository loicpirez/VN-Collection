import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Vitest runs this BEFORE any test file is imported. We pin DB_PATH
// to a per-worker temp directory so the real lib/db (which resolves
// DB_PATH lazily on first open) writes to a throwaway file instead
// of clobbering the project's data/collection.db.
const tmp = mkdtempSync(join(tmpdir(), 'vndb-test-'));
process.env.DB_PATH = join(tmp, 'collection.db');

process.on('exit', () => {
  rmSync(tmp, { recursive: true, force: true });
});
