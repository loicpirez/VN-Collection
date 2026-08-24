import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [path] : [];
  });
}

describe('production SQL portability', () => {
  it('does not use SQLite replace statements', () => {
    const offenders = listSourceFiles(join(process.cwd(), 'src')).filter((path) =>
      /INSERT\s+OR\s+REPLACE\s+INTO/i.test(readFileSync(path, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });

  it('does not read SQLite connection-local generated identifiers', () => {
    const offenders = listSourceFiles(join(process.cwd(), 'src')).filter((path) =>
      /lastInsertRowid/.test(readFileSync(path, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});
