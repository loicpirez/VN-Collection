'use client';
import { useState } from 'react';
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
 * VNDB-style "hidden chip" with click-to-reveal:
 *   - When `level > currentSpoilerLevel` or `sexual && !showSexual` the
 *     chip renders as a blurred placeholder with a lock icon.
 *   - Click anywhere on the placeholder to unblur just that chip.
 *   - Once revealed, a warning-toned border + lock-marker stays so the
 *     user always knows this content is spoilery, mirroring vndb.org's
 *     "showspoil" toggle UX.
 *   - The reveal state is local to the chip (no global side-effect);
 *     reload re-redacts.
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

  if (shouldHide && !revealed) {
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        // `aria-pressed=false` advertises the reveal state so screen-
        // reader users can hear when a chip is hidden vs. revealed.
        // Pairs with the `aria-pressed=true` set on the revealed chip
        // below so the toggle is symmetric. `aria-label` flips between
        // "Reveal" and "Hide" in step with the state — the visible
        // label-less placeholder needs an accessible name either way.
        aria-pressed={false}
        className="group inline-flex items-center gap-1 rounded-md border border-dashed border-status-on_hold/60 bg-bg-elev/40 px-2 py-0.5 text-[11px] text-status-on_hold/80 transition-colors hover:border-status-on_hold hover:text-status-on_hold"
        title={isHiddenBySexual ? t.spoiler.showSexual : t.spoiler.title}
        aria-label={t.spoiler.revealOne}
      >
        <Lock className="h-2.5 w-2.5" aria-hidden />
        <span className="font-mono">{'█'.repeat(4)}</span>
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
