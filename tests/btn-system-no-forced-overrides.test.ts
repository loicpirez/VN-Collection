/**
 * R5-211 — pins that `.btn` and `.btn-xs` are the canonical button
 * primitives. New surfaces must NOT hand-roll forced-override
 * styles like `btn !py-1 !text-xs` or `btn px-2 py-1 text-xs` —
 * those bypass the design system and were the exact mixed-primitive
 * pattern the row was opened to fix.
 *
 * Allowed:
 *   `btn`                          (default size)
 *   `btn btn-primary`
 *   `btn btn-danger`
 *   `btn btn-xs`                   (compact)
 *   `btn btn-primary btn-xs`
 *   `btn shrink-0` / `btn flex-1`  (layout helper, no size override)
 *
 * Rejected by this test:
 *   `btn …!py-`                    (Tailwind `!` important padding override)
 *   `btn …!text-xs`                (`!` important text-size override)
 *   `btn …px-N py-N text-xs`       (re-implements the `.btn-xs` shape inline)
 *
 * If a future surface genuinely needs a new variant, declare it in
 * `globals.css` as `.btn-…` and extend the allowlist below — don't
 * re-add inline forced overrides.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function* walkSrc(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) yield* walkSrc(full);
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) yield full;
  }
}

interface Hit {
  file: string;
  line: number;
  text: string;
}

function findClassNames(text: string): string[] {
  // Matches `className="…btn…"` only; we don't want to flag CSS
  // selectors or plain strings.
  const out: string[] = [];
  const rx = /className=("([^"]*)"|\{`([^`]*)`\})/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const value = m[2] ?? m[3] ?? '';
    if (value.includes('btn')) out.push(value);
  }
  return out;
}

function violations(): Hit[] {
  const out: Hit[] = [];
  for (const file of walkSrc(join(ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, idx) => {
      // Only inspect lines that mention btn.
      if (!line.includes('btn')) return;
      const matches = findClassNames(line);
      for (const cls of matches) {
        const tokens = cls.split(/\s+/);
        // We only care about classes that include the canonical `btn`
        // primitive — bespoke buttons that don't use `.btn` at all are
        // a separate concern (audited per surface, not banned wholesale).
        if (!tokens.includes('btn')) continue;
        // Reject `!py-…` / `!text-…` forced overrides.
        if (tokens.some((t) => /^!py-/.test(t) || /^!text-/.test(t) || /^!px-/.test(t))) {
          out.push({ file, line: idx + 1, text: line.trim() });
          continue;
        }
        // Reject inline re-implementation of `.btn-xs`'s shape
        // (px-N py-N text-xs|text-[Npx]) without using the variant
        // class. Layout helpers like `flex-1` / `shrink-0` are fine.
        const hasInlinePx = tokens.some((t) => /^px-\d/.test(t));
        const hasInlinePy = tokens.some((t) => /^py-\d/.test(t));
        const hasInlineText = tokens.some((t) => /^text-(xs|sm)$/.test(t) || /^text-\[/.test(t));
        const hasBtnXs = tokens.includes('btn-xs');
        if (!hasBtnXs && hasInlinePx && hasInlinePy && hasInlineText) {
          out.push({ file, line: idx + 1, text: line.trim() });
        }
      }
    });
  }
  return out;
}

describe('R5-211 — no forced-override button styles on `.btn`', () => {
  it('every <button className="btn …"> uses canonical variants only', () => {
    const hits = violations();
    expect(
      hits,
      hits.length
        ? `Forced btn overrides found — migrate to btn-xs or extend globals.css with a named variant:\n${hits
            .map((h) => `  ${h.file}:${h.line}\n    ${h.text}`)
            .join('\n')}`
        : 'no forced-override hits',
    ).toEqual([]);
  });
});

describe('R5-211 — .btn-xs primitive exists and is well-defined', () => {
  const CSS = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');

  it('globals.css declares .btn-xs', () => {
    expect(CSS).toMatch(/\.btn-xs\s*\{[\s\S]+?px-2[\s\S]+?py-1[\s\S]+?text-xs/);
  });
});

describe('R5-211 — canonical large variants still defined', () => {
  const CSS = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');
  it('globals.css declares .btn with px-4 / py-2 / text-sm', () => {
    expect(CSS).toMatch(/\.btn\s*\{[\s\S]+?px-4[\s\S]+?py-2[\s\S]+?text-sm/);
  });
  it('globals.css declares .btn-primary', () => {
    expect(CSS).toMatch(/\.btn-primary\s*\{/);
  });
  it('globals.css declares .btn-danger', () => {
    expect(CSS).toMatch(/\.btn-danger\s*\{/);
  });
});
