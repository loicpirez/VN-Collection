'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, GraduationCap, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

const STORAGE_KEY = 'vn_tour_completed_v1';

interface Step {
  /** Page to navigate to before showing the step. */
  route: string;
  /** Title i18n key suffix - see dictionaries.ts `tour.steps.*`. */
  key: string;
}

const STEPS: Step[] = [
  { route: '/', key: 'library' },
  { route: '/search', key: 'search' },
  { route: '/lists', key: 'lists' },
  { route: '/recommendations', key: 'recommend' },
  { route: '/upcoming', key: 'upcoming' },
  { route: '/quotes', key: 'quotes' },
  { route: `/year?y=${new Date().getFullYear()}`, key: 'year' },
  { route: '/stats', key: 'stats' },
  { route: '/shelf', key: 'shelf' },
  { route: '/shelf?view=layout', key: 'shelfLayout' },
  { route: '/steam', key: 'steam' },
  { route: '/egs', key: 'egs' },
  { route: '/dumped', key: 'dumped' },
  { route: '/data', key: 'data' },
];

/**
 * Lightweight 14-step guided pass over the most important surfaces of
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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = window.localStorage.getItem(STORAGE_KEY);
    function onStart() {
      setStep(0);
      setActive(true);
      router.push(STEPS[0].route);
    }
    window.addEventListener('vn-tour:start', onStart);
    // Auto-open only on the library home page. Deep links such as
    // /stock should never be hijacked back to "/".
    if (!done && pathname === '/') {
      const id = setTimeout(() => {
        setActive(true);
        router.push(STEPS[0].route);
      }, 800);
      return () => {
        clearTimeout(id);
        window.removeEventListener('vn-tour:start', onStart);
      };
    }
    return () => window.removeEventListener('vn-tour:start', onStart);
  }, [pathname, router]);

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
    if (upcoming >= STEPS.length) {
      close();
      return;
    }
    setStep(upcoming);
    router.push(STEPS[upcoming].route);
  }

  if (!active) return null;
  const cur = STEPS[step];
  const total = STEPS.length;
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
      className="fixed inset-x-3 bottom-16 z-50 max-h-[min(70vh,32rem)] overflow-y-auto rounded-2xl border border-accent/40 bg-bg-card p-4 shadow-card outline-none sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[min(92vw,420px)] sm:p-5"
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
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
        <span>{step + 1} / {total}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={close} className="btn min-h-[44px] text-xs sm:min-h-0">
            {t.tour.skip}
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
