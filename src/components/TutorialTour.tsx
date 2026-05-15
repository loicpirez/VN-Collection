'use client';
import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, GraduationCap, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

const STORAGE_KEY = 'vn_tour_completed_v1';

interface Step {
  /** Page to navigate to before showing the step. */
  route: string;
  /** Title i18n key suffix — see dictionaries.ts `tour.steps.*`. */
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
  { route: '/', key: 'vnpage' },
];

/**
 * Lightweight five-step guided pass over the most important surfaces of
 * the app. Shown automatically on first visit (gated on localStorage),
 * re-runnable from /data → Tour. Each step navigates to its route and
 * surfaces a fixed bottom-right panel with the page's pitch.
 *
 * Not a full Shepherd-style spotlight overlay — that's overkill for a
 * desktop-only single-user tool. The panel + auto-navigation is enough
 * to onboard the user without wrestling with element-anchored callouts
 * that break every time we re-skin a page.
 */
export function TutorialTour() {
  const t = useT();
  const router = useRouter();
  const titleId = useId();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const done = window.localStorage.getItem(STORAGE_KEY);
    function onStart() { setStep(0); setActive(true); }
    window.addEventListener('vn-tour:start', onStart);
    // Auto-open on first visit only.
    if (!done) {
      const id = setTimeout(() => setActive(true), 800);
      return () => {
        clearTimeout(id);
        window.removeEventListener('vn-tour:start', onStart);
      };
    }
    return () => window.removeEventListener('vn-tour:start', onStart);
  }, []);

  function close(remember = true) {
    setActive(false);
    if (remember && typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, '1');
    }
  }

  function next() {
    const upcoming = step + 1;
    if (upcoming >= STEPS.length) {
      close(true);
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

  // Non-modal dialog — the tour panel coexists with the page content
  // and shouldn't trap focus. Screen readers should still announce
  // it as a dialog with an accessible name so users hear the title
  // and step count when it appears.
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="fixed bottom-4 right-4 z-50 w-[min(92vw,420px)] rounded-2xl border border-accent/40 bg-bg-card p-5 shadow-card"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span id={titleId} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent">
          <GraduationCap className="h-4 w-4" aria-hidden /> {t.tour.title}
        </span>
        <button
          type="button"
          onClick={() => close(true)}
          className="tap-target-tight rounded text-muted hover:text-white"
          aria-label={t.common.close}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <h3 className="text-base font-bold">{t.tour.steps[titleKey] as string}</h3>
      <p className="mt-1 text-sm text-white/85">{t.tour.steps[bodyKey] as string}</p>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
        <span>{step + 1} / {total}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => close(true)} className="btn text-xs">
            {t.tour.skip}
          </button>
          <button type="button" onClick={next} className="btn btn-primary text-xs">
            {step + 1 === total ? t.tour.finish : t.tour.next}
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Public helper — anything can dispatch this event to restart the tour. */
export function startTour() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('vn-tour:start'));
  }
}
