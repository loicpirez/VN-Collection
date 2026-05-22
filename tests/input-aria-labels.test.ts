/**
 * D-A3 pin: every interactive `<input>` visible to users has an
 * accessible name — either via a wrapping `<label>`, `htmlFor`/`id`
 * pair, or an explicit `aria-label` / `aria-labelledby` attribute.
 *
 * This test guards the surfaces where `aria-label` was missing and
 * subsequently added:
 *
 *   - EgsPanel: EGS game search input inside the picker dialog
 *   - LinkToVndbButton: VNDB search input inside the link dialog
 *   - ShelfLayoutEditor: "create new shelf" name input
 *   - RoutesSection: add-route input and the inline edit-name input
 *
 * For each surface we assert `aria-label={t.<key>}` is present so a
 * future refactor cannot silently strip the attribute.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('D-A3 — EgsPanel search input has aria-label', () => {
  const src = read('src/components/EgsPanel.tsx');

  it('search input carries aria-label={t.egs.searchPlaceholder}', () => {
    expect(src).toMatch(/aria-label=\{t\.egs\.searchPlaceholder\}/);
  });
});

describe('D-A3 — LinkToVndbButton search input has aria-label', () => {
  const src = read('src/components/LinkToVndbButton.tsx');

  it('search input carries aria-label={t.linkVndb.searchPlaceholder}', () => {
    expect(src).toMatch(/aria-label=\{t\.linkVndb\.searchPlaceholder\}/);
  });
});

describe('D-A3 — ShelfLayoutEditor create-shelf input has aria-label', () => {
  const src = read('src/components/ShelfLayoutEditor.tsx');

  it('new-shelf name input carries aria-label={t.shelfLayout.newShelfName}', () => {
    expect(src).toMatch(/aria-label=\{t\.shelfLayout\.newShelfName\}/);
  });
});

describe('D-A3 — RoutesSection inputs have aria-label', () => {
  const src = read('src/components/RoutesSection.tsx');

  it('add-route input carries aria-label={t.routes.addPlaceholder}', () => {
    expect(src).toMatch(/aria-label=\{t\.routes\.addPlaceholder\}/);
  });

  it('edit-route-name input carries aria-label={t.routes.addPlaceholder}', () => {
    const matches = src.match(/aria-label=\{t\.routes\.addPlaceholder\}/g);
    expect(matches?.length, 'must appear twice — once on add input, once on edit input').toBe(2);
  });
});

describe('D-A9 — SchemaLocalSection table has aria-label', () => {
  const src = read('src/components/SchemaLocalSection.tsx');

  it('each per-table <table> carries aria-label={table.name}', () => {
    expect(src).toMatch(/aria-label=\{table\.name\}/);
  });
});

describe('D-A8 — SpoilerChip: <Link> does not carry aria-pressed', () => {
  const src = read('src/components/SpoilerChip.tsx');

  it('does not apply aria-pressed to the revealed <Link> (links are not toggles)', () => {
    expect(src).not.toMatch(/aria-pressed=\{wasGatedAndRevealed \? true : undefined\}/);
  });

  it('the hide <button> still carries aria-pressed={true}', () => {
    expect(src).toMatch(/aria-pressed=\{true\}/);
  });
});
