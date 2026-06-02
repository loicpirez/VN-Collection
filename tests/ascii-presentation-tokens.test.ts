import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PRESENTATION_GLYPHS = /[\u00b7\u00d7\u2014\u2013]/u;
const DICTIONARY_GLYPHS = /[\u00b7\u00d7\u2014\u2013\u2194\u2192\u2026]/u;

function walkTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkTsx(path);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('ASCII presentation token contract', () => {
  it('keeps decorative separators and missing-value glyphs out of TSX surfaces', () => {
    for (const path of [...walkTsx('src/app'), ...walkTsx('src/components')]) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(PRESENTATION_GLYPHS);
    }
  });

  it('keeps decorative presentation glyphs out of locale dictionaries', () => {
    expect(readFileSync('src/lib/i18n/dictionaries.ts', 'utf8')).not.toMatch(DICTIONARY_GLYPHS);
  });
});
