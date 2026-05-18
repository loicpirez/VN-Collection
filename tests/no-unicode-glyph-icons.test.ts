/**
 * R5-152 pin: no Unicode-glyph "icons" (●, ○, ★, ✓, ✕, →, ←,
 * etc.) survive inside JSX text where a Lucide icon (or labelled
 * span) should be. Decorative typography characters like em-dash
 * (—) inside textual content are allowed; this scan specifically
 * targets the standalone "glyph-as-icon" pattern that screen
 * readers cannot describe and that breaks i18n.
 *
 * The previous shape (the only offender at the time of the row)
 * was `<span>●</span>` in `src/components/SearchClient.tsx`,
 * used as an "advanced filters active" badge. Replaced with
 * `<Circle aria-label={t.search.advancedActive}>`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function* walkSrc(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walkSrc(p);
    else if (/\.(tsx?|jsx?)$/.test(entry)) yield p;
  }
}

const GLYPH_ICON_RE =
  />\s*[●○◆◇★☆✓✗✕→←↑↓⌛]\s*[<})\]]/;

describe('R5-152 — no standalone Unicode-glyph icons in JSX', () => {
  it('no `>●<` style glyph icon survives anywhere under src/', () => {
    const offenders: string[] = [];
    for (const path of walkSrc(join(ROOT, 'src'))) {
      const src = readFileSync(path, 'utf8');
      if (GLYPH_ICON_RE.test(src)) {
        offenders.push(path.slice(ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('SearchClient.tsx imports Circle from lucide-react and renders it for advActive', () => {
    const src = readFileSync(
      join(ROOT, 'src/components/SearchClient.tsx'),
      'utf8',
    );
    // `Circle` is part of the lucide-react import block.
    expect(src).toMatch(/import\s*\{[^}]*\bCircle\b[^}]*\}\s*from\s*['"]lucide-react['"]/s);
    // Rendered inside the advActive branch.
    expect(src).toMatch(/advActive\s*&&[\s\S]*<Circle\b/);
  });
});
