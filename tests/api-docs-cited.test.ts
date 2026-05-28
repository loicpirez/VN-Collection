import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('KANA / EGS subtle quirks cited in code comments', () => {
  it('vndb.ts:fetchTopVnsByTag documents the (tag id, maxSpoiler, minTagLevel) tuple order', () => {
    const src = readFileSync(join(ROOT, 'src/lib/vndb.ts'), 'utf8');
    expect(src).toMatch(/Order per KANA\.md example/);
    expect(src).toMatch(/maxSpoiler\s*\(integer/);
    expect(src).toMatch(/minTagLevel\s*\(float/);
  });

  it('vndb.ts:getCharactersForTrait documents the trait filter tuple shape', () => {
    const src = readFileSync(join(ROOT, 'src/lib/vndb.ts'), 'utf8');
    expect(src).toMatch(/trait filter tuple order per KANA\.md/);
  });

  it('scrape-tag-dag.ts documents why the hierarchy is scraped (KANA gap)', () => {
    const src = readFileSync(join(ROOT, 'src/lib/scrape-tag-dag.ts'), 'utf8');
    expect(src).toMatch(/VNDB hierarchy gap/);
    expect(src).toMatch(/parent\s*\/\s*child relationship/);
  });

  it('erogamescape.ts documents the SQL form constraints', () => {
    const src = readFileSync(join(ROOT, 'src/lib/erogamescape.ts'), 'utf8');
    expect(src).toMatch(/sql_for_erogamer_form\.php/);
    expect(src).toMatch(/REQUIRES POST/);
    expect(src).toMatch(/HTML table/);
    expect(src).toMatch(/lowercase/);
  });
});
