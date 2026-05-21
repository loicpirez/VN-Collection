import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spoilerVisibility } from '@/lib/spoiler-reveal';

/**
 * Character-page spoiler contract:
 *
 *   1. The character description itself is plain VNDB markup and is
 *      never wrapped in a top-level SpoilerReveal. Only the
 *      `[spoiler]…[/spoiler]` regions inside the description get
 *      gated — that's the VndbMarkup-level concern.
 *   2. Trait chips with `spoiler: 1` or `spoiler: 2` use SpoilerChip,
 *      which composes the same visibility rule as the shared helper
 *      (validated below).
 *   3. The reveal trigger advertises `aria-expanded` so screen-reader
 *      users hear that hidden content can be expanded. The hide affordance uses `aria-pressed`.
 *
 * Source-pin tests here defend against three regression classes:
 *   - Someone adds a top-level SpoilerReveal around VndbMarkup on the
 *     character page (over-redaction).
 *   - Someone removes the aria-pressed from SpoilerChip.
 *   - Someone changes the trait section to bypass SpoilerChip.
 */
const ROOT = join(__dirname, '..');
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('character page — description is not gated at the top level', () => {
  const src = read('src/app/character/[id]/page.tsx');

  it('renders the description via <VndbMarkup>', () => {
    expect(src).toMatch(/<VndbMarkup text=\{char\.description\} spoilerLabel=\{t\.spoiler\.markupSummary\} \/>/);
  });

  it('never wraps the description in a <SpoilerReveal>', () => {
    // We assert SpoilerReveal does not appear ANYWHERE in this file —
    // not imported, not referenced. Internal `[spoiler]…[/spoiler]`
    // gating is handled INSIDE VndbMarkup itself.
    expect(src).not.toMatch(/SpoilerReveal/);
  });
});

describe('character page — trait chips route through <SpoilerChip>', () => {
  const meta = read('src/components/CharacterMetaClient.tsx');

  it('imports SpoilerChip', () => {
    expect(meta).toMatch(/import \{ SpoilerChip \}/);
  });
  it('renders one SpoilerChip per trait', () => {
    expect(meta).toMatch(/<SpoilerChip[\s\S]*?level=\{tr\.spoiler\}/);
  });
  it('threads the global setting through `currentSpoilerLevel`', () => {
    expect(meta).toMatch(/currentSpoilerLevel=\{level\}/);
  });
});

describe('SpoilerChip — aria-pressed and hide affordance', () => {
  const src = read('src/components/SpoilerChip.tsx');

  it('uses aria-expanded on the hidden-state reveal button', () => {
    expect(src).toMatch(/aria-expanded=\{effectiveState === 'transient'\}/);
  });
  it('flips aria-pressed when the user reveals a previously-gated chip', () => {
    expect(src).toMatch(/aria-pressed=\{wasGatedAndRevealed \? true : undefined\}/);
  });
  it('exposes a localised "Reveal spoiler" aria-label on the gated state', () => {
    expect(src).toMatch(/aria-label=\{t\.spoiler\.revealOne\}/);
  });
  it('does not render block-character redaction placeholders', () => {
    expect(src).not.toMatch(/█/);
  });
  it('exposes a localised "Hide spoiler" aria-label on the hide button', () => {
    expect(src).toMatch(/aria-label=\{t\.spoiler\.hideOne\}/);
  });
  it('reveals via setRevealed(true) and hides via setRevealed(false)', () => {
    expect(src).toMatch(/setRevealed\(true\)/);
    expect(src).toMatch(/setRevealed\(false\)/);
  });
});

describe('InlineSpoilerReveal — global setting resync + hover preview', () => {
  const meta = read('src/components/CharacterMetaClient.tsx');

  it('resets local reveal overrides when autoReveal changes', () => {
    expect(meta).toMatch(/useEffect\(\(\) => \{\s*setLocalRevealed\(null\);[\s\S]*?\}, \[autoReveal\]\)/);
  });

  it('uses text labels instead of block-character redaction', () => {
    expect(meta).not.toMatch(/█/);
  });

  it('wires hover / focus state so hover reveals readable text', () => {
    // Per the operator rule "hover reveals actual visible text", the
    // inline placeholder must attach pointer-enter / leave / focus
    // / blur handlers so it transiently shows the readable value.
    expect(meta).toMatch(/onPointerEnter=\{\(\) => setHovered\(true\)\}/);
    expect(meta).toMatch(/onPointerLeave=\{\(\) => setHovered\(false\)\}/);
    expect(meta).toMatch(/onFocus=\{\(\) => setFocused\(true\)\}/);
    expect(meta).toMatch(/onBlur=\{\(\) => setFocused\(false\)\}/);
  });
});

describe('SpoilerChip — hover/focus preview parity with SpoilerReveal', () => {
  const src = read('src/components/SpoilerChip.tsx');

  it('wires hover and focus handlers on the gated state', () => {
    expect(src).toMatch(/onPointerEnter=\{onPointerEnter\}/);
    expect(src).toMatch(/onPointerLeave=\{onPointerLeave\}/);
    expect(src).toMatch(/onFocus=\{onFocus\}/);
    expect(src).toMatch(/onBlur=\{onBlur\}/);
  });

  it('exposes data-spoiler-state for QA/Playwright assertions', () => {
    expect(src).toMatch(/data-spoiler-state=/);
  });
});

describe('SpoilerChip — gating rule mirrors the shared helper', () => {
  // SpoilerChip uses a slightly simpler rule (no transient hover state)
  // but the SAME thresholding: `level > currentSpoilerLevel` hides,
  // otherwise reveals. Pin parity with `spoilerVisibility` so a future
  // refactor that consolidates the two paths can't drift.
  it('hides a level-1 trait when global setting is 0', () => {
    // SpoilerChip: level=1, currentSpoilerLevel=0 → hidden
    // spoilerVisibility: globalSetting=0, nodeLevel=1 → 'hidden'
    expect(spoilerVisibility({
      globalSetting: 0, nodeLevel: 1,
      isHovered: false, isFocused: false, isTapped: false,
    })).toBe('hidden');
  });
  it('reveals a level-1 trait when global setting is 1', () => {
    expect(spoilerVisibility({
      globalSetting: 1, nodeLevel: 1,
      isHovered: false, isFocused: false, isTapped: false,
    })).toBe('revealed');
  });
  it('reveals a level-2 trait when global setting is 2', () => {
    expect(spoilerVisibility({
      globalSetting: 2, nodeLevel: 2,
      isHovered: false, isFocused: false, isTapped: false,
    })).toBe('revealed');
  });
});
