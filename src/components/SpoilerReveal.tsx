'use client';
import { useCallback, useState } from 'react';
import { Lock } from 'lucide-react';
import { useDisplaySettings } from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';
import { spoilerVisibility } from '@/lib/spoiler-reveal';

interface Props {
  /** Spoiler level of the wrapped node (0=safe, 1=minor, 2=major). */
  level: 0 | 1 | 2;
  /** Optional per-section override (e.g. URL `?spoil=2`). */
  perSectionOverride?: 0 | 1 | 2 | null;
  /** Localised label rendered on the masked placeholder. */
  hiddenLabel?: string;
  /** When set, the child is rendered with this className while
   *  blurred (so the layout doesn't collapse to a tiny pill). */
  blurredClassName?: string;
  children: React.ReactNode;
}

/**
 * Shared spoiler gate component. Rules (centralised in
 * `lib/spoiler-reveal.ts`):
 *   - Default visibility is driven by the global `spoilerLevel`
 *     setting + an optional per-section override raised through
 *     `perSectionOverride`.
 *   - Pointer hover (desktop) and keyboard focus reveal transiently;
 *     leaving / blurring re-hides. The shown content stays in the
 *     DOM but is blurred so screen readers + page search can still
 *     find it.
 *   - A touch tap toggles a persistent reveal for THAT node until
 *     the next reload (no `localStorage`, scoped to render lifetime).
 *     We detect touch via `pointerType === 'touch'` on `pointerUp`
 *     so a mouse click is NOT treated as a tap-toggle.
 *   - Enter on a focused node also toggles the tap state — keyboard
 *     parity with the touch gesture.
 *
 * Applied surfaces:
 *   - VN tag chips (`VnTagChips`)
 *   - Character traits (CharacterMetaClient)
 *   - VNDB synopsis spoiler BBCode (`VndbMarkup` `[spoiler]` block)
 *   - Anything else that has a `spoiler` integer column.
 *
 * NOT applied: VNDB quote scores. The schema doesn't ship a
 * per-quote spoiler flag today; gating quotes here would require
 * an upstream change. Left out per the blocker spec.
 */
export function SpoilerReveal({
  level,
  perSectionOverride = null,
  hiddenLabel,
  blurredClassName,
  children,
}: Props) {
  const t = useT();
  const { settings } = useDisplaySettings();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tapped, setTapped] = useState(false);

  const visibility = spoilerVisibility({
    globalSetting: settings.spoilerLevel,
    nodeLevel: level,
    isHovered: hovered,
    isFocused: focused,
    isTapped: tapped,
    perSectionOverride,
  });

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    // Touch / pen → toggle a persistent reveal. Mouse clicks bypass
    // so the hover-to-reveal UX is preserved (a mouse user
    // accidentally clicking on a chip wouldn't want a persistent
    // toggle). Pen is grouped with touch since the gesture model
    // matches (no hover-only surface to depend on).
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      setTapped((v) => !v);
    }
  }, []);
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setTapped((v) => !v);
    }
  }, []);

  // ARIA: when hidden, advertise the gate as a button-like control.
  // When revealed, the wrapper is just a presentation span. Either
  // way `aria-hidden` on the underlying child is wrong (screen
  // reader users want to know what was hidden), so we expose a
  // localised label on the wrapper instead.
  if (visibility === 'hidden') {
    return (
      <span
        role="button"
        tabIndex={0}
        aria-pressed={false}
        aria-label={hiddenLabel ?? t.spoiler.revealOne}
        title={hiddenLabel ?? t.spoiler.revealOne}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerUp={onPointerUp}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        className="inline-flex select-none items-center gap-1 rounded-md border border-dashed border-status-on_hold/60 bg-bg-elev/40 px-2 py-0.5 text-[11px] text-status-on_hold/80 outline-none transition-colors hover:border-status-on_hold focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Lock className="h-2.5 w-2.5" aria-hidden />
        <span className="font-mono" aria-hidden>{'█'.repeat(4)}</span>
      </span>
    );
  }
  const isTransient = visibility === 'transient';
  return (
    <span
      tabIndex={0}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerUp={onPointerUp}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={onKeyDown}
      // `transition` keeps the unblur smooth so revealing-by-hover
      // isn't a jarring flash. `aria-pressed` reflects the tap
      // toggle so screen readers know the state.
      aria-pressed={tapped}
      data-spoiler-state={visibility}
      className={`inline-block outline-none transition-[filter] duration-150 focus-visible:ring-2 focus-visible:ring-accent ${
        isTransient && !tapped ? `${blurredClassName ?? 'blur-sm'} cursor-pointer` : ''
      }`}
    >
      {children}
    </span>
  );
}
