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
 * Stable-root design (R5-218 fix):
 *
 *   - The **outer `<span data-spoiler-state>` is rendered in every state**
 *     (hidden / transient / revealed). The inner element type changes
 *     (a `<button>` while gated, a `<Link>` once revealed) but the
 *     wrapper survives all transitions. This guarantees that any QA /
 *     Playwright handle on `[data-spoiler-state]` stays valid across a
 *     hover → click sequence — the previous design lost the click on a
 *     now-detached `<button>` node when the user clicked to reveal.
 *
 *   - Desktop hover and keyboard focus reveal the actual chip text
 *     transiently (the inner `<button>` shows the children, not the
 *     "Hidden content" placeholder). The wrapper's `data-spoiler-state`
 *     flips to `"transient"`.
 *
 *   - Click / tap / Enter / Space persists the reveal. The wrapper's
 *     `data-spoiler-state` flips to `"revealed"` and the inner element
 *     switches to a navigable `<Link>`. A small "Hide" button appears
 *     alongside so the user can re-mask without reloading.
 *
 *   - Reveal state is local to the chip; reload re-redacts.
 *
 *   - The chip never shows the legacy block-character placeholder
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
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (shouldHide && !revealed) {
          e.preventDefault();
          setRevealed(true);
        }
      }
    },
    [shouldHide, revealed],
  );
  const onWrapperClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      if (!shouldHide || revealed) return;
      if (e.detail === 0) return;
      e.preventDefault();
      e.stopPropagation();
      setRevealed(true);
    },
    [shouldHide, revealed],
  );

  // Compute the visible state advertised on the wrapper. Hidden = masked
  // with no hover/focus and no click. Transient = hover/focus while still
  // gated. Revealed = the operator clicked through OR the chip was never
  // gated.
  const effectiveState: 'hidden' | 'transient' | 'revealed' =
    !shouldHide || revealed
      ? 'revealed'
      : hovered || focused
        ? 'transient'
        : 'hidden';

  // While gated (button branch), preview state should show the real
  // children behind the lock — so the operator can read the tag during
  // hover/focus and decide whether to click to persist.
  const isStillSpoilery = level > 0 || sexual;
  const wasGatedAndRevealed = shouldHide && revealed;

  return (
    <span
      className="inline-flex items-stretch"
      data-spoiler-state={effectiveState}
      onClick={onWrapperClick}
      onKeyDown={onKeyDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {effectiveState !== 'revealed' ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          aria-pressed={false}
          aria-label={t.spoiler.revealOne}
          className={`group inline-flex items-center gap-1 rounded-md border bg-bg-elev/40 px-2 py-0.5 text-[11px] transition-colors hover:border-status-on_hold ${
            effectiveState === 'transient'
              ? 'border-status-on_hold/40 text-status-on_hold'
              : 'border-dashed border-status-on_hold/60 text-status-on_hold/80'
          }`}
          title={effectiveState === 'transient' ? t.spoiler.hideHint : hiddenLabel}
        >
          <Lock className="h-2.5 w-2.5" aria-hidden />
          {effectiveState === 'transient' ? (
            // Transient preview — show the real chip content so the
            // operator can read the tag during hover/focus.
            <span className="inline-flex items-center gap-1">{children}</span>
          ) : (
            // Masked — localised text label, no block-characters.
            <span>{hiddenLabel}</span>
          )}
        </button>
      ) : (
        <>
          <Link
            href={href}
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
              onClick={(e) => {
                e.stopPropagation();
                setRevealed(false);
              }}
              aria-label={t.spoiler.hideOne}
              aria-pressed={true}
              title={t.spoiler.hideOne}
              className="-ml-px inline-flex items-center rounded-r-md border border-l-0 border-border bg-bg-elev/40 px-1 text-muted hover:border-accent hover:text-accent"
            >
              <EyeOff className="h-2.5 w-2.5" aria-hidden />
            </button>
          )}
        </>
      )}
    </span>
  );
}
