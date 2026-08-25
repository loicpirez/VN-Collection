import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('production typing discipline', () => {
  it('contains no never casts or TypeScript suppression directives', () => {
    const offenders = sourceFiles('src').flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return /\bas never\b|@ts-(?:ignore|nocheck|expect-error)/.test(source) ? [path] : [];
    });
    expect(offenders).toEqual([]);
  });
});
