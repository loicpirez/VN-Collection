'use client';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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
  /** Extra blur classes when transiently revealing (default `blur-sm`). */
  blurredClassName?: string;
  children: ReactNode;
}

/**
 * Cascade context.
 *
 * When an outer `<SpoilerReveal>` resolves to `revealed`, every
 * descendant `<SpoilerReveal>` whose level is `≤` the ancestor's
 * level also shows as revealed regardless of its own gate state.
 * Without this, the old code left nested `[spoiler]` blocks inside
 * a revealed tag chip blurred — the operator's "double-hidden text
 * after reveal" report.
 *
 * The context only ever escalates visibility, never demotes it.
 */
interface SpoilerCascade {
  ancestorRevealedLevel: 0 | 1 | 2;
}
const SpoilerCascadeContext = createContext<SpoilerCascade>({ ancestorRevealedLevel: -1 as 0 });

/**
 * Shared spoiler gate component.
 *
 * Rule fixes vs. the prior implementation:
 *
 *   1. The masked + revealed states render through the SAME wrapper
 *      element. Previously we returned a fresh `<span>` for the
 *      hidden branch and a different `<span>` for the
 *      transient/revealed branch. React unmounted the first wrapper
 *      the moment hover fired, the cursor was still over the *old*
 *      element, and the new element didn't receive a fresh
 *      pointerEnter — so the gate flickered back to hidden and
 *      stayed "black-blocked". The single-wrapper layout keeps the
 *      listener attached across state transitions.
 *
 *   2. Children stay in the DOM in every state. Hidden replaces the
 *      visible content with a localised `aria-label` + a small lock
 *      icon, but the underlying children remain so SR users still
 *      hear "spoiler — press to reveal" and screen-search can index
 *      the page. No more wholesale "█████" replacement, which the
 *      operator saw as a persistent black block.
 *
 *   3. `SpoilerCascadeContext` propagates the ancestor's revealed
 *      level downward. A nested `<SpoilerReveal level=2>` inside a
 *      revealed `<SpoilerReveal level=2>` is automatically marked
 *      revealed too — the cascade prevents double-hiding.
 *
 *   4. Sexual-content tags use the same gate (no separate
 *      "blackout" CSS branch). They render through `<SpoilerReveal
 *      level={2}>` per the existing call sites, and now obey the
 *      same hover / focus / tap rules.
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
  const ancestor = useContext(SpoilerCascadeContext);

  const visibility = spoilerVisibility({
    globalSetting: settings.spoilerLevel,
    nodeLevel: level,
    isHovered: hovered,
    isFocused: focused,
    isTapped: tapped,
    perSectionOverride,
  });

  // Cascade override — an ancestor at >= my level overrides me to
  // revealed. Never lowers; only ever escalates.
  const effective: 'hidden' | 'transient' | 'revealed' =
    ancestor.ancestorRevealedLevel >= level ? 'revealed' : visibility;

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
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

  // Build the cascade value for descendants. If THIS node ends up
  // revealed (either base-revealed or via hover/focus/tap),
  // descendants up to my level are also treated revealed.
  const nextCascade = useMemo<SpoilerCascade>(() => {
    if (effective === 'revealed' || effective === 'transient') {
      return { ancestorRevealedLevel: Math.max(level, ancestor.ancestorRevealedLevel) as 0 | 1 | 2 };
    }
    return ancestor;
  }, [effective, level, ancestor]);

  // ---- Hidden / transient / revealed → SAME wrapper ----------------
  const isHidden = effective === 'hidden';
  const isTransient = effective === 'transient';

  // Wrapper class: when hidden, render a dashed-border button-like
  // tile. When transient, show the children with a soft blur. When
  // revealed, render the children plain. Important: NO opaque
  // overlay anywhere — the masked state is a bordered placeholder
  // with text, never an opaque rectangle.
  const wrapperClass = [
    'group/spoiler inline-block outline-none transition-[filter] duration-150 focus-visible:ring-2 focus-visible:ring-accent',
    isHidden
      ? 'cursor-pointer select-none rounded-md border border-dashed border-status-on_hold/60 bg-bg-elev/40 px-2 py-0.5 text-[11px] text-status-on_hold/80 hover:border-status-on_hold'
      : '',
    isTransient ? `cursor-pointer ${blurredClassName ?? 'blur-sm'}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <SpoilerCascadeContext.Provider value={nextCascade}>
      <span
        role={isHidden ? 'button' : undefined}
        tabIndex={0}
        aria-pressed={isHidden ? false : tapped}
        aria-label={isHidden ? hiddenLabel ?? t.spoiler.revealOne : undefined}
        title={isHidden ? hiddenLabel ?? t.spoiler.revealOne : undefined}
        data-spoiler-state={effective}
        data-spoiler-level={level}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerUp={onPointerUp}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        className={wrapperClass}
      >
        {isHidden ? (
          <>
            {/* Visible placeholder text + lock icon. The actual
                child stays mounted but visually masked via
                `sr-only` so screen-readers + page search still
                find it. NO opaque black rectangle. */}
            <span className="inline-flex items-center gap-1">
              <Lock className="h-2.5 w-2.5" aria-hidden />
              <span>{hiddenLabel ?? t.spoiler.revealOne}</span>
            </span>
            <span className="sr-only">{children}</span>
          </>
        ) : (
          children
        )}
      </span>
    </SpoilerCascadeContext.Provider>
  );
}
