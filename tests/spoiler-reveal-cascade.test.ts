/**
 * Source-pin contract for the rewritten `<SpoilerReveal>`.
 *
 * The runtime cascade behaviour (nested SpoilerReveal — outer
 * revealed → inner also reveals at <= outer level) is enforced by
 * the `SpoilerCascadeContext` propagation in the source. Tests run
 * in `environment: 'node'` (no jsdom) so DOM rendering isn't an
 * option; instead we pin the structural invariants that previous
 * regressions broke:
 *
 *   1. The cascade context exists.
 *   2. The descendant escalation path is wired (`useContext` +
 *      `ancestorRevealedLevel >= level` short-circuit).
 *   3. The masked + revealed render paths share a wrapper (no
 *      separate `<span>` returned for the hidden branch — that was
 *      the cause of the hover flicker / "black block" report).
 *   4. NO opaque-black overlay class is used to mask hidden state.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(__dirname, '..', 'src/components/SpoilerReveal.tsx'),
  'utf8',
);

describe('SpoilerReveal — cascade + single-wrapper invariants', () => {
  it('exposes a SpoilerCascadeContext', () => {
    expect(SOURCE).toMatch(/createContext\b/);
    expect(SOURCE).toMatch(/SpoilerCascadeContext/);
  });

  it('consumes the cascade and short-circuits when ancestor revealed at >= my level', () => {
    expect(SOURCE).toMatch(/useContext\(SpoilerCascadeContext\)/);
    expect(SOURCE).toMatch(/ancestorRevealedLevel\s*>=\s*level/);
  });

  it('propagates a fresh cascade value down the subtree', () => {
    expect(SOURCE).toMatch(/SpoilerCascadeContext\.Provider/);
  });

  it('renders ONE wrapper element (no `return (...)` branch that returns a different <span> for hidden)', () => {
    // The previous bug: two `return (<span ...>` branches in the
    // same function (hidden vs. revealed). Counting the function-
    // body `return (` tokens — there must be at most ONE
    // top-level return that emits the outer span wrapper.
    const returnSpanMatches = SOURCE.match(/return\s+\(\s*<(span|SpoilerCascadeContext\.Provider)\b/g) ?? [];
    expect(returnSpanMatches.length).toBe(1);
  });

  it('does not paint the masked state with an opaque black overlay', () => {
    // The operator flagged "black block after reveal". The fix is
    // a dashed-bordered tile + lock icon, NOT a `bg-black` /
    // `bg-status-dropped` rectangle.
    expect(SOURCE).not.toMatch(/bg-black\b/);
    // Allow `bg-bg-elev/40` (a very soft tint) — that's the
    // tile-surface class the codebase uses everywhere.
  });

  it('keeps children mounted in the hidden branch (sr-only) so SR users hear the spoiler text', () => {
    // The children container always stays in the DOM. When hidden the
    // className resolves to 'sr-only' (via a ternary or literal); the
    // exact form depends on the implementation — match either.
    expect(SOURCE).toMatch(/'sr-only'/);
  });
});
