/**
 * Pure visibility logic for the shared `<SpoilerReveal>` component.
 * Extracted so unit tests can pin the truth table without rendering
 * React (Vitest runs in a node environment with no DOM here).
 *
 * Inputs:
 *   - `globalSetting`  the user-wide spoiler level (0/1/2). 0 hides
 *      everything > 0, 1 reveals minor spoilers, 2 reveals all.
 *   - `nodeLevel`     the spoiler level of the wrapped node.
 *   - `isHovered`     pointer hover (desktop) — transient reveal.
 *   - `isFocused`     keyboard focus — transient reveal.
 *   - `isTapped`      mobile/tap toggled reveal — persistent on the
 *                     node until the user re-taps or the page reloads.
 *   - `perSectionOverride?` optional `?spoil=1|2` URL override that
 *      raises the global setting just for the current page section.
 *
 * Returns the visibility verdict:
 *   - `'hidden'`   → fully masked (blurred placeholder).
 *   - `'revealed'` → fully visible, no transient gate.
 *   - `'transient'`→ shown right now thanks to hover/focus/tap but
 *      will re-hide once the gate ends.
 *
 * Why a separate function: the same logic powers tag chips, character
 * traits, synopsis BBCode spoilers, and any other place that gates a
 * child node. Centralising the rules means the keyboard-vs-touch
 * parity guarantee is enforced in one spot.
 */

export type SpoilerVisibility = 'hidden' | 'revealed' | 'transient';

export interface SpoilerVisibilityInput {
  globalSetting: 0 | 1 | 2;
  nodeLevel: 0 | 1 | 2;
  isHovered: boolean;
  isFocused: boolean;
  isTapped: boolean;
  perSectionOverride?: 0 | 1 | 2 | null;
}

export function spoilerVisibility(input: SpoilerVisibilityInput): SpoilerVisibility {
  const { globalSetting, nodeLevel, isHovered, isFocused, isTapped, perSectionOverride } = input;
  // Per-section override raises (never lowers) the effective level —
  // a section that opts in with `?spoil=2` reveals all, even if the
  // user's global setting is 0. Lowering via per-section override is
  // intentionally NOT supported: it would defeat the global "hide
  // everything" privacy intent.
  const effective = Math.max(globalSetting, perSectionOverride ?? 0) as 0 | 1 | 2;
  if (nodeLevel <= effective) return 'revealed';
  if (isTapped) return 'transient';
  if (isHovered || isFocused) return 'transient';
  return 'hidden';
}

/**
 * Parse the `spoil` URL search param, defaulting to `null` when missing
 * or invalid. Used by VN-detail tags + traits sections.
 */
export function parseSpoilerOverride(raw: string | string[] | undefined | null): 0 | 1 | 2 | null {
  if (raw == null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === '0') return 0;
  if (value === '1') return 1;
  if (value === '2') return 2;
  return null;
}
