import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const CALLEE_FILES = [
  'src/app/character/[id]/page.tsx',
  'src/app/staff/[id]/page.tsx',
  'src/app/producer/[id]/page.tsx',
  'src/app/tag/[id]/page.tsx',
  'src/app/release/[id]/page.tsx',
  'src/app/trait/[id]/page.tsx',
  'src/components/FieldCompare.tsx',
  'src/components/CustomSynopsis.tsx',
  'src/components/QuotesSection.tsx',
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('VndbMarkup call sites', () => {
  it.each(CALLEE_FILES)('passes a localized spoilerLabel in %s', (rel) => {
    const source = withoutComments(read(rel));
    const calls = source.match(/<VndbMarkup\b[^>]*>/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toMatch(/spoilerLabel=/);
    }
  });

  it('does not keep a hardcoded default spoiler label in VndbMarkup', () => {
    expect(read('src/components/VndbMarkup.tsx')).not.toMatch(/spoilerLabel\s*=\s*['"]spoiler['"]/);
  });
});
