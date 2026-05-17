import { describe, expect, it } from 'vitest';
import { spoilerVisibility } from '@/lib/spoiler-reveal';

/**
 * Pin the contract that the default reveal state of a spoiler-wrapped
 * node is a deterministic function of `(globalSetting, nodeLevel,
 * perSectionOverride)` — no local cache, no component state that
 * survives navigation.
 *
 * The page-level invariants this enforces:
 *   - On a fresh page load (no hover, no tap, no focus), the visible
 *     state is derived purely from those three inputs.
 *   - `?spoil=` URL params raise the effective level only for the
 *     page that sets them — the helper consumes the override at
 *     visibility time, never persists it.
 *
 * The transient-reveal cases (hover / focus / tap) are deliberately
 * NOT exercised here — they're covered in `spoiler-reveal.test.ts`.
 * This file is the place that future regressions of the "default
 * state on fresh load" contract will trip first.
 */

function fresh(input: Partial<Parameters<typeof spoilerVisibility>[0]>) {
  // "Fresh load" simulates a page render with no user interaction.
  return spoilerVisibility({
    globalSetting: 0,
    nodeLevel: 0,
    isHovered: false,
    isFocused: false,
    isTapped: false,
    ...input,
  });
}

describe('spoiler default state on fresh page render', () => {
  it('global=0 hides a level-1 node by default', () => {
    expect(fresh({ globalSetting: 0, nodeLevel: 1 })).toBe('hidden');
  });

  it('global=1 reveals a level-1 node by default', () => {
    expect(fresh({ globalSetting: 1, nodeLevel: 1 })).toBe('revealed');
  });

  it('global=2 reveals a level-2 node by default', () => {
    expect(fresh({ globalSetting: 2, nodeLevel: 2 })).toBe('revealed');
  });

  it('global=0 hides a level-2 node by default', () => {
    expect(fresh({ globalSetting: 0, nodeLevel: 2 })).toBe('hidden');
  });

  it('per-section override of 2 ("spoil me") overrides global 0', () => {
    expect(fresh({ globalSetting: 0, nodeLevel: 2, perSectionOverride: 2 })).toBe('revealed');
    expect(fresh({ globalSetting: 0, nodeLevel: 1, perSectionOverride: 2 })).toBe('revealed');
  });

  it('per-section override of 0 ("hide all") does NOT lower global 2 — overrides take MAX', () => {
    // The historical concern was that a `?spoil=0` URL param on a
    // page would unexpectedly suppress a user's permissive global
    // setting. The helper deliberately ignores a LOWERING override
    // — a user that set global=2 keeps their spoiler-on-by-default
    // behaviour. Documented in spoilerVisibility() comments.
    expect(fresh({ globalSetting: 2, nodeLevel: 2, perSectionOverride: 0 })).toBe('revealed');
    expect(fresh({ globalSetting: 2, nodeLevel: 1, perSectionOverride: 0 })).toBe('revealed');
  });

  it('null perSectionOverride leaves global setting in charge', () => {
    expect(fresh({ globalSetting: 1, nodeLevel: 2, perSectionOverride: null })).toBe('hidden');
    expect(fresh({ globalSetting: 2, nodeLevel: 2, perSectionOverride: null })).toBe('revealed');
  });

  it('undefined perSectionOverride is treated identically to null', () => {
    expect(fresh({ globalSetting: 0, nodeLevel: 1 })).toBe('hidden');
    expect(fresh({ globalSetting: 1, nodeLevel: 1 })).toBe('revealed');
  });
});
