'use client';
import { useEffect, useRef, useState } from 'react';
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
  /** Rendered when revealed - the actual chip content. */
  children: React.ReactNode;
  /** Optional tooltip (e.g. for the localized lie/spoiler badge label). */
  title?: string;
}

/**
 * VNDB-style "gated tag chip" with hover/focus preview + click-to-reveal.
 *
 * Progressive disclosure design:
 *
 *   - Gated chips use native `<details>/<summary>`, so the first tap,
 *     Enter, or Space works even before React hydrates the section.
 *
 *   - CSS hover and focus-within preview the actual chip text before
 *     hydration; React mirrors transient/revealed state after hydration.
 *
 *   - The summary remains the native close control after reveal, while
 *     the destination link becomes independently navigable.
 *
 *   - Reveal state is local to the chip; reload re-redacts.
 *
 *   - The chip never shows the legacy block-character placeholder
 *     - the operator's "persistent black block" regression.
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
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const hiddenLabel = isHiddenBySexual ? t.spoiler.showSexual : t.spoiler.markupSummary;

  useEffect(() => {
    if (detailsRef.current?.open) setRevealed(true);
  }, []);

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

  const isStillSpoilery = level > 0 || sexual;
  const revealedClassName = `inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-md border bg-bg-elev/40 px-2 py-0.5 text-[11px] transition-colors hover:border-accent hover:text-accent can-hover:sm:min-h-0 can-hover:sm:min-w-0 ${
    lie
      ? 'border-status-on_hold/40 text-status-on_hold'
      : level > 0
        ? 'border-status-on_hold/30 text-status-on_hold/90'
        : sexual
          ? 'border-status-dropped/30 text-status-dropped'
          : 'border-border text-muted'
  }`;

  const revealedContent = (
    <Link
      href={href}
      prefetch={false}
      className={revealedClassName}
      title={title ?? (lie ? t.detail.tagLie : level > 0 ? t.spoiler.title : undefined)}
    >
      {isStillSpoilery && <Lock className="h-2.5 w-2.5 opacity-60" aria-hidden />}
      {children}
      {lie && (<><AlertTriangle className="h-2.5 w-2.5" aria-hidden /><span className="sr-only">{t.detail.tagLie}</span></>)}
      {level > 0 && !lie && <span className="text-[9px]" aria-hidden>!</span>}
    </Link>
  );

  if (!shouldHide) {
    return <span className="inline-flex items-stretch" data-spoiler-state="revealed">{revealedContent}</span>;
  }

  return (
    <details
      ref={detailsRef}
      className="group/spoiler-chip inline-flex items-stretch"
      data-spoiler-state={effectiveState}
      onToggle={(event) => setRevealed(event.currentTarget.open)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <summary
        data-spoiler-summary
        aria-label={revealed ? t.spoiler.hideOne : t.spoiler.revealOne}
        title={revealed ? t.spoiler.hideOne : effectiveState === 'transient' ? t.spoiler.hideHint : hiddenLabel}
        className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer list-none items-center rounded-md border border-dashed border-status-on_hold/60 bg-bg-elev/40 px-2 py-0.5 text-[11px] text-status-on_hold/80 transition-colors hover:border-status-on_hold can-hover:sm:min-h-0 can-hover:sm:min-w-0 [&::-webkit-details-marker]:hidden"
      >
        <span className="grid group-open/spoiler-chip:hidden">
          <span className="col-start-1 row-start-1 inline-flex items-center gap-1 group-hover/spoiler-chip:invisible group-focus-within/spoiler-chip:invisible">
            <Lock className="h-2.5 w-2.5" aria-hidden />
            <span>{hiddenLabel}</span>
          </span>
          <span data-spoiler-preview className="invisible col-start-1 row-start-1 inline-flex items-center gap-1 group-hover/spoiler-chip:visible group-focus-within/spoiler-chip:visible">
            <Lock className="h-2.5 w-2.5" aria-hidden />
            {children}
          </span>
        </span>
        <span className="hidden items-center gap-1 group-open/spoiler-chip:inline-flex">
          <EyeOff className="h-2.5 w-2.5" aria-hidden />
          <span>{t.spoiler.hideOne}</span>
        </span>
      </summary>
      <span className="hidden items-stretch group-open/spoiler-chip:inline-flex">
        {revealedContent}
      </span>
    </details>
  );
}
