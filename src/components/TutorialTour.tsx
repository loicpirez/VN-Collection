'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, GraduationCap, List, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { currentCalendarYear } from '@/lib/locale-number';
import { navigationHref, type NavigationRouteId } from '@/lib/navigation-registry';

const STORAGE_KEY = 'vn_tour_completed_v1';

interface Step {
  /** Page to navigate to before showing the step. */
  route: string;
  /** Title i18n key suffix - see dictionaries.ts `tour.steps.*`. */
  key: string;
}

interface StepDefinition {
  routeId: NavigationRouteId;
  key: string;
  suffix?: string;
}

const STEP_DEFINITIONS: readonly StepDefinition[] = [
  { routeId: 'library', key: 'library' },
  { routeId: 'search', key: 'search' },
  { routeId: 'search', key: 'localSearch', suffix: '?source=local' },
  { routeId: 'lists', key: 'lists' },
  { routeId: 'recommendations', key: 'recommend' },
  { routeId: 'upcoming', key: 'upcoming' },
  { routeId: 'compare', key: 'compare' },
  { routeId: 'quotes', key: 'quotes' },
  { routeId: 'year', key: 'year' },
  { routeId: 'stats', key: 'stats' },
  { routeId: 'shelf', key: 'shelf' },
  { routeId: 'shelf', key: 'shelfLayout', suffix: '?view=layout' },
  { routeId: 'steam', key: 'steam' },
  { routeId: 'egs', key: 'egs' },
  { routeId: 'stock', key: 'stock' },
  { routeId: 'places', key: 'places' },
  { routeId: 'places', key: 'aliceNet' },
  { routeId: 'map', key: 'map' },
  { routeId: 'dumped', key: 'dumped' },
  { routeId: 'data', key: 'data' },
];

export function tourSteps(year: number): Step[] {
  return STEP_DEFINITIONS.map((definition) => ({
    route: `${navigationHref(definition.routeId, year)}${definition.suffix ?? ''}`,
    key: definition.key,
  }));
}

/**
 * Lightweight 20-step guided pass over the most important surfaces of
 * the app. Shown automatically on first visit (gated on localStorage),
 * re-runnable from the data page's Tour action. Each step navigates to its route and
 * surfaces a fixed bottom-right panel with the page's pitch.
 *
 * The panel stays non-modal so the destination route remains operable.
 * Its constrained mobile geometry, focus shift, and live announcement
 * keep each step readable without obscuring the entire viewport.
 */
export function TutorialTour() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const titleId = useId();
  const bodyId = useId();
  const stepListId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const steps = useMemo(() => tourSteps(currentCalendarYear()), []);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = window.localStorage.getItem(STORAGE_KEY);
    function onStart() {
      setStep(0);
      setActive(true);
      router.push(steps[0].route);
    }
    window.addEventListener('vn-tour:start', onStart);
    // Auto-open only on the library home page. Deep links such as
    // /stock should never be hijacked back to "/".
    if (!done && pathname === '/') {
      const id = setTimeout(() => {
        setActive(true);
        router.push(steps[0].route);
      }, 800);
      return () => {
        clearTimeout(id);
        window.removeEventListener('vn-tour:start', onStart);
      };
    }
    return () => window.removeEventListener('vn-tour:start', onStart);
  }, [pathname, router, steps]);

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setActive(false);
      window.localStorage.setItem(STORAGE_KEY, '1');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    panelRef.current?.focus({ preventScroll: true });
  }, [active, step]);

  function close() {
    setActive(false);
    window.localStorage.setItem(STORAGE_KEY, '1');
  }

  function next() {
    const upcoming = step + 1;
    if (upcoming >= steps.length) {
      close();
      return;
    }
    setStep(upcoming);
    router.push(steps[upcoming].route);
  }

  function goTo(target: number) {
    setStep(target);
    router.push(steps[target].route);
  }

  function previous() {
    goTo(step - 1);
  }

  if (!active) return null;
  const cur = steps[step];
  const total = steps.length;
  const titleKey = `step_${cur.key}_title` as keyof typeof t.tour.steps;
  const bodyKey = `step_${cur.key}_body` as keyof typeof t.tour.steps;

  // Non-modal dialog - the tour panel coexists with the page content
  // and shouldn't trap focus. Screen readers should still announce
  // it as a dialog with an accessible name so users hear the title
  // and step count when it appears.
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      tabIndex={-1}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      className="fixed inset-x-3 bottom-16 z-layer-popover max-h-[min(70vh,32rem)] overflow-y-auto rounded-2xl border border-accent/40 bg-bg-card p-4 shadow-card outline-none sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[min(92vw,420px)] sm:p-5"
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {step + 1} / {total}: {t.tour.steps[titleKey] as string}
      </p>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span id={titleId} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent">
          <GraduationCap className="h-4 w-4" aria-hidden /> {t.tour.title}
        </span>
        <button
          type="button"
          onClick={close}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:text-white"
          aria-label={t.common.close}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <h3 className="text-base font-bold">{t.tour.steps[titleKey] as string}</h3>
      <p id={bodyId} className="mt-1 text-sm text-white/85">{t.tour.steps[bodyKey] as string}</p>
      <details className="mt-3 rounded-md border border-border/70 bg-bg-elev/35 text-xs">
        <summary
          aria-controls={stepListId}
          className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 py-2 font-semibold text-muted hover:text-white"
        >
          <List className="h-3.5 w-3.5" aria-hidden />
          {t.tour.stepList}
        </summary>
        <ol id={stepListId} className="max-h-48 overflow-y-auto border-t border-border/70 p-1">
          {steps.map((item, index) => {
            const itemTitleKey = `step_${item.key}_title` as keyof typeof t.tour.steps;
            return (
              <li key={`${item.route}-${item.key}`}>
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  aria-current={index === step ? 'step' : undefined}
                  className={`flex min-h-[44px] w-full items-center gap-2 rounded px-2 py-1.5 text-left ${index === step ? 'bg-accent/15 font-semibold text-accent' : 'text-muted hover:bg-bg-elev hover:text-white'}`}
                >
                  <span className="w-6 shrink-0 text-right font-mono">{index + 1}</span>
                  <span>{t.tour.steps[itemTitleKey] as string}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </details>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{step + 1} / {total}</span>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <button type="button" onClick={close} className="btn min-h-[44px] text-xs sm:min-h-0">
            {t.tour.skip}
          </button>
          <button
            type="button"
            onClick={previous}
            disabled={step === 0}
            className="btn min-h-[44px] text-xs disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            {t.tour.back}
          </button>
          <button type="button" onClick={next} className="btn btn-primary min-h-[44px] text-xs sm:min-h-0">
            {step + 1 === total ? t.tour.finish : t.tour.next}
            <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Public helper - anything can dispatch this event to restart the tour. */
export function startTour() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('vn-tour:start'));
}
