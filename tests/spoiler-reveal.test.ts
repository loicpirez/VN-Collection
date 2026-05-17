import { describe, expect, it } from 'vitest';
import { parseSpoilerOverride, spoilerVisibility } from '@/lib/spoiler-reveal';

/**
 * Pin the visibility truth table for the shared `<SpoilerReveal>`
 * component. The component composes pointer / focus / tap state on
 * top of these inputs, but the visibility verdict itself MUST be
 * deterministic and side-effect-free — otherwise the keyboard /
 * touch / mouse parity guarantee is unenforceable.
 */
describe('spoilerVisibility', () => {
  function v(input: Partial<Parameters<typeof spoilerVisibility>[0]>) {
    return spoilerVisibility({
      globalSetting: 0,
      nodeLevel: 0,
      isHovered: false,
      isFocused: false,
      isTapped: false,
      ...input,
    });
  }

  it('reveals nodes at or below the global setting', () => {
    expect(v({ globalSetting: 0, nodeLevel: 0 })).toBe('revealed');
    expect(v({ globalSetting: 1, nodeLevel: 1 })).toBe('revealed');
    expect(v({ globalSetting: 2, nodeLevel: 0 })).toBe('revealed');
    expect(v({ globalSetting: 2, nodeLevel: 2 })).toBe('revealed');
  });

  it('hides nodes above the global setting by default', () => {
    expect(v({ globalSetting: 0, nodeLevel: 1 })).toBe('hidden');
    expect(v({ globalSetting: 0, nodeLevel: 2 })).toBe('hidden');
    expect(v({ globalSetting: 1, nodeLevel: 2 })).toBe('hidden');
  });

  it('reveals transiently on hover or focus', () => {
    expect(v({ globalSetting: 0, nodeLevel: 1, isHovered: true })).toBe('transient');
    expect(v({ globalSetting: 0, nodeLevel: 2, isFocused: true })).toBe('transient');
  });

  it('reveals transiently when tap-toggled (mobile / pen)', () => {
    expect(v({ globalSetting: 0, nodeLevel: 2, isTapped: true })).toBe('transient');
  });

  it('per-section override raises the effective level', () => {
    // perSectionOverride 2 reveals every node, even when global is 0.
    expect(v({ globalSetting: 0, nodeLevel: 2, perSectionOverride: 2 })).toBe('revealed');
    expect(v({ globalSetting: 0, nodeLevel: 1, perSectionOverride: 1 })).toBe('revealed');
  });

  it('per-section override never lowers the level', () => {
    // globalSetting=2 should still reveal a level-1 node even with
    // perSectionOverride=0 — overrides take MAX, not REPLACE.
    expect(v({ globalSetting: 2, nodeLevel: 1, perSectionOverride: 0 })).toBe('revealed');
  });

  it('tap state survives hover end (persistent until re-tapped)', () => {
    // Hover false + tap true → still transient. The component re-hides
    // only when the user re-taps (component-level state), so the
    // visibility verdict here just needs to acknowledge the tap.
    expect(v({ globalSetting: 0, nodeLevel: 2, isHovered: false, isTapped: true })).toBe('transient');
  });
});

describe('parseSpoilerOverride', () => {
  it('parses the three valid string values', () => {
    expect(parseSpoilerOverride('0')).toBe(0);
    expect(parseSpoilerOverride('1')).toBe(1);
    expect(parseSpoilerOverride('2')).toBe(2);
  });

  it('returns null for missing / unknown values', () => {
    expect(parseSpoilerOverride(undefined)).toBeNull();
    expect(parseSpoilerOverride(null)).toBeNull();
    expect(parseSpoilerOverride('')).toBeNull();
    expect(parseSpoilerOverride('3')).toBeNull();
    expect(parseSpoilerOverride('on')).toBeNull();
  });

  it('handles array params (Next.js search params)', () => {
    expect(parseSpoilerOverride(['2'])).toBe(2);
    expect(parseSpoilerOverride(['junk'])).toBeNull();
  });
});
