'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, EyeOff, Lock } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface Props {
  /** Spoiler level of this item (0/1/2). Anything > spoilerLevel from settings is masked. */
  level: number;
  /** True if the item is flagged sexual / NSFW. Forces the lock when `showSexual=false`. */
  sexual?: boolean;
  /** True if the source flagged the field as a "lie" (false-information tag). Rendered with an `AlertTriangle` icon. */
  lie?: boolean;
  /** Resolved spoilerLevel from <SpoilerToggle/>. */
  currentSpoilerLevel: number;
  /** Resolved showSexualTraits from <SpoilerToggle/>. */
  showSexual: boolean;
  href: string;
  /** Rendered when revealed — the actual chip content. */
  children: React.ReactNode;
  /** Optional tooltip (e.g. for the localized lie/spoiler badge label). */
  title?: string;
}

/**
 * VNDB-style "gated tag chip" with hover/focus preview + click-to-reveal.
 *
 * Behaviour matches the operator's spec:
 *   - When `level > currentSpoilerLevel` or `sexual && !showSexual` the
 *     chip renders as a text placeholder (lock + localised hidden label).
 *   - **Desktop hover and keyboard focus reveal the actual readable
 *     chip text transiently.** When the pointer leaves / blur fires
 *     the chip re-masks itself — no persistent change.
 *   - **Click / tap (or Enter/Space)** persists the reveal until the
 *     user clicks the "Hide" affordance. Persistent reveal also
 *     activates the underlying `<Link>` so the chip behaves as a
 *     normal navigation chip on the second interaction.
 *   - Reveal state is local to the chip; reload re-redacts.
 *   - The chip never shows the legacy "block-character" placeholder
 *     — the operator's "persistent black block" regression.
 */
export function SpoilerChip({
  level,
  sexual = false,
  lie = false,
  currentSpoilerLevel,
  showSexual,
  href,
  children,
  title,
}: Props) {
  const t = useT();
  const isHiddenBySpoiler = level > currentSpoilerLevel;
  const isHiddenBySexual = !showSexual && sexual;
  const shouldHide = isHiddenBySpoiler || isHiddenBySexual;
  const [revealed, setRevealed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const hiddenLabel = isHiddenBySexual ? t.spoiler.showSexual : t.spoiler.markupSummary;

  const onPointerEnter = useCallback(() => setHovered(true), []);
  const onPointerLeave = useCallback(() => setHovered(false), []);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);

  if (shouldHide && !revealed) {
    // Either masked (no hover/focus) or transient preview (hover/focus
    // active). Both states render through the SAME element so we don't
    // lose pointer events on transition — same fix as SpoilerReveal.
    const isPreview = hovered || focused;
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        // `aria-pressed=false` advertises the reveal state so screen-
        // reader users can hear when a chip is hidden vs. revealed.
        // Pairs with the `aria-pressed=true` set on the revealed chip
        // below so the toggle is symmetric.
        aria-pressed={false}
        className={`group inline-flex items-center gap-1 rounded-md border bg-bg-elev/40 px-2 py-0.5 text-[11px] transition-colors hover:border-status-on_hold ${
          isPreview
            ? 'border-status-on_hold/40 text-status-on_hold'
            : 'border-dashed border-status-on_hold/60 text-status-on_hold/80'
        }`}
        title={isPreview ? t.spoiler.hideHint : hiddenLabel}
        aria-label={t.spoiler.revealOne}
        data-spoiler-state={isPreview ? 'transient' : 'hidden'}
      >
        <Lock className="h-2.5 w-2.5" aria-hidden />
        {isPreview ? (
          // Transient preview — show the real chip content so the
          // operator can actually READ the tag while hovering. No
          // navigation yet (the chip is still a <button>).
          <span className="inline-flex items-center gap-1">{children}</span>
        ) : (
          // Masked — localised text label, never block-characters.
          <span>{hiddenLabel}</span>
        )}
      </button>
    );
  }

  // Either always-visible (no spoiler/sexual gating) or already revealed.
  const isStillSpoilery = level > 0 || sexual;
  // When the chip was gated and the user revealed it, expose a small
  // explicit "Hide" affordance next to the chip — without it, the
  // user can re-hide only by reloading the page (the spec explicitly
  // requires a Hide gesture once a chip has been revealed).
  const wasGatedAndRevealed = shouldHide && revealed;
  return (
    <span className="inline-flex items-stretch">
      <Link
        href={href}
        // `aria-pressed=true` only meaningful while the chip is
        // toggled-revealed (it WAS gated, the user opted in). Plain
        // always-visible chips don't surface a pressed state.
        aria-pressed={wasGatedAndRevealed ? true : undefined}
        className={`inline-flex items-center gap-1 rounded-md border bg-bg-elev/40 px-2 py-0.5 text-[11px] transition-colors hover:border-accent hover:text-accent ${
          lie
            ? 'border-status-on_hold/40 text-status-on_hold'
            : level > 0
              ? 'border-status-on_hold/30 text-status-on_hold/90'
              : sexual
                ? 'border-status-dropped/30 text-status-dropped'
                : 'border-border text-muted'
        }`}
        title={title ?? (lie ? t.detail.tagLie : level > 0 ? t.spoiler.title : undefined)}
      >
        {isStillSpoilery && <Lock className="h-2.5 w-2.5 opacity-60" aria-hidden />}
        {children}
        {lie && <AlertTriangle className="h-2.5 w-2.5" aria-label={t.detail.tagLie} />}
        {level > 0 && !lie && <span className="text-[9px]" aria-hidden>!</span>}
      </Link>
      {wasGatedAndRevealed && (
        <button
          type="button"
          onClick={() => setRevealed(false)}
          aria-label={t.spoiler.hideOne}
          aria-pressed={true}
          title={t.spoiler.hideOne}
          className="-ml-px inline-flex items-center rounded-r-md border border-l-0 border-border bg-bg-elev/40 px-1 text-muted hover:border-accent hover:text-accent"
        >
          <EyeOff className="h-2.5 w-2.5" aria-hidden />
        </button>
      )}
    </span>
  );
}
