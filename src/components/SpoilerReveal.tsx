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
  /**
   * Optional CSS classes applied to the visible content while the
   * spoiler is in `transient` (hover/focus) state. The operator's
   * rule is that hover/focus reveal **actual readable text** — so
   * the default is `''` (no blur). Override only when a specific
   * call site wants a softer preview (e.g. nested sexual chips).
   */
  transientClassName?: string;
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

export function SpoilerReveal({
  level,
  perSectionOverride = null,
  hiddenLabel,
  transientClassName,
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

  const toggleTapped = useCallback(() => {
    setTapped((v) => !v);
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') toggleTapped();
  }, [toggleTapped]);
  const onClick = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    if (e.detail === 0) return;
    toggleTapped();
  }, [toggleTapped]);
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleTapped();
    }
  }, []);

  // Build the cascade value for descendants. If THIS node ends up
  // revealed (either base-revealed or via hover/focus/click/tap),
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

  // Wrapper class: cursor and focus ring only. The placeholder span
  // carries its own dashed-border/padding so the wrapper size does
  // NOT change when we swap between hidden and revealed — this is the
  // key fix for the hover-flicker bug: if the wrapper resized on
  // transition the pointer would move off the now-smaller element and
  // pointerLeave would fire, snapping back to hidden.
  const wrapperClass = [
    'group/spoiler inline-block outline-none focus-visible:ring-2 focus-visible:ring-accent',
    isHidden ? 'cursor-pointer select-none' : '',
    isTransient ? 'cursor-pointer' : '',
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
        onClick={onClick}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        className={wrapperClass}
      >
        {/* Placeholder: always in the DOM, hidden via CSS when
            not needed. This keeps the wrapper at a stable size
            so pointer events are not lost on transition. */}
        <span
          className={
            isHidden
              ? 'inline-flex items-center gap-1 rounded-md border border-dashed border-status-on_hold/60 bg-bg-elev/40 px-2 py-0.5 text-[11px] text-status-on_hold/80 transition-colors hover:border-status-on_hold'
              : 'hidden'
          }
          aria-hidden={!isHidden}
        >
          <Lock className="h-2.5 w-2.5" aria-hidden />
          <span>{hiddenLabel ?? t.spoiler.revealOne}</span>
        </span>
        {/*
          Real content: always rendered; visibility controlled by
          CSS classes so the DOM is stable across state changes.

          The user requirement is that hover/focus reveals **actual
          readable text**. So `transient` defaults to no blur, just
          the raw content. Call sites that want a softer preview
          (rare) can opt in via `transientClassName`. The previous
          `blur-sm` default was the "hover did not reveal actual
          readable text" regression.
        */}
        <span
          className={
            isHidden
              ? 'sr-only'
              : isTransient
                ? transientClassName ?? ''
                : ''
          }
        >
          {children}
        </span>
      </span>
    </SpoilerCascadeContext.Provider>
  );
}
