import Database from 'better-sqlite3';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface QaSnapshotOptions {
  /** Repository root whose `.qa` directory is the only permitted destination. */
  repoRoot: string;
  /** SQLite database to snapshot, including committed WAL transactions. */
  sourcePath: string;
  /** Disposable destination database below `<repoRoot>/.qa`. */
  targetPath: string;
}

/**
 * Create an integrity-checked SQLite snapshot for write-capable browser QA.
 *
 * `Database#backup` uses SQLite's online backup API, so committed records that
 * still live in the source WAL are copied consistently with the main database.
 *
 * @param options Repository root and source/destination database paths.
 * @returns A promise that resolves after the destination passes `quick_check`.
 */
export async function prepareQaSnapshot(options: QaSnapshotOptions): Promise<void> {
  const repoRoot = resolve(options.repoRoot);
  const qaRoot = resolve(repoRoot, '.qa');
  const sourcePath = resolve(repoRoot, options.sourcePath);
  const targetPath = resolve(repoRoot, options.targetPath);
  const targetRelativeToQa = relative(qaRoot, targetPath);

  if (
    targetRelativeToQa === ''
    || isAbsolute(targetRelativeToQa)
    || targetRelativeToQa === '..'
    || targetRelativeToQa.startsWith(`..${sep}`)
  ) {
    throw new Error(`QA snapshot destination must be inside ${qaRoot}`);
  }
  if (sourcePath === targetPath) {
    throw new Error('QA snapshot source and destination must be different files');
  }

  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    const sourceIntegrity = source.pragma('quick_check', { simple: true });
    if (sourceIntegrity !== 'ok') {
      throw new Error(`Source SQLite quick_check failed: ${String(sourceIntegrity)}`);
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    for (const candidate of [targetPath, `${targetPath}-wal`, `${targetPath}-shm`]) {
      if (existsSync(candidate)) unlinkSync(candidate);
    }
    await source.backup(targetPath);
  } finally {
    source.close();
  }

  const snapshot = new Database(targetPath, { readonly: true, fileMustExist: true });
  try {
    const snapshotIntegrity = snapshot.pragma('quick_check', { simple: true });
    if (snapshotIntegrity !== 'ok') {
      throw new Error(`QA snapshot quick_check failed: ${String(snapshotIntegrity)}`);
    }
  } finally {
    snapshot.close();
  }
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const sourcePath = process.env.QA_SOURCE_DB ?? 'data/collection.db';
  const targetPath = process.env.QA_DB_PATH ?? '.qa/data/collection.db';
  await prepareQaSnapshot({ repoRoot, sourcePath, targetPath });
  process.stdout.write(`QA SQLite snapshot ready: ${resolve(repoRoot, targetPath)}\n`);
}

const entryPoint = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPoint === fileURLToPath(import.meta.url)) {
  main().catch((error: Error) => {
    process.stderr.write(`qa:prepare failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
