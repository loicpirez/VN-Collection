import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidVnId, normalizeVnId } from '@/lib/vn-id-shape';

const ROOT = join(__dirname, '..');
const CANONICAL_HELPER = 'src/lib/vn-id-shape.ts';
const DUPLICATE_PATTERNS = [
  '/^(v\\d+|egs_\\d+)$/i',
  '/^(?:v\\d+|egs_\\d+)$/i',
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) yield* walk(path);
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry)) yield path;
  }
}

describe('canonical VN id source contract', () => {
  it('keeps the canonical combined regex in one helper module', () => {
    const offenders: string[] = [];
    for (const path of walk(join(ROOT, 'src'))) {
      const relativePath = path.slice(ROOT.length + 1);
      if (relativePath === CANONICAL_HELPER) continue;
      const source = readFileSync(path, 'utf8');
      if (DUPLICATE_PATTERNS.some((pattern) => source.includes(pattern))) {
        offenders.push(relativePath);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('normalizes accepted mixed-case ids for case-sensitive storage', () => {
    expect(isValidVnId('V90001')).toBe(true);
    expect(normalizeVnId('V90001')).toBe('v90001');
    expect(isValidVnId('EGS_9000001')).toBe(true);
    expect(normalizeVnId('EGS_9000001')).toBe('egs_9000001');
  });
});
