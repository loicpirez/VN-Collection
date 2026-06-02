'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Target } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { SkeletonBlock } from './Skeleton';
import { readApiError } from '@/lib/api-error-read';
import {
  decodeReadingGoalMutationResponse,
  decodeReadingGoalResponse,
  READING_GOAL_TARGET_MAX,
} from '@/lib/tracking-client-shape';

interface Props {
  year: number;
}

/**
 * Yearly reading goal card. Fetches on mount, lets the user set / update the
 * target, and renders a progress ring against `countFinishedInYear`.
 *
 * Lives in `/stats` and the `/year` page so the user can adjust it from
 * either entry point without an extra navigation.
 */
export function ReadingGoalCard({ year }: Props) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [target, setTarget] = useState<number | null>(null);
  const [finished, setFinished] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const identityRef = useRef<number | null>(year);
  const saveAbortRef = useRef<AbortController | null>(null);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    const ownerYear = year;
    const ac = new AbortController();
    saveAbortRef.current?.abort();
    saveAbortRef.current = null;
    saveInFlightRef.current = false;
    identityRef.current = ownerYear;
    setTarget(null);
    setFinished(0);
    setEditing(false);
    setDraft('');
    setBusy(false);
    setLoaded(false);
    fetch(`/api/reading-goal?year=${ownerYear}`, { cache: 'no-store', signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        const data = decodeReadingGoalResponse(await r.json());
        if (!data) throw new Error(t.common.error);
        return data;
      })
      .then((data) => {
        if (ac.signal.aborted || identityRef.current !== ownerYear) return;
        setTarget(data.goal?.target ?? null);
        setFinished(data.finished);
        setDraft(String(data.goal?.target ?? ''));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ac.signal.aborted && identityRef.current === ownerYear) setLoaded(true);
      });
    return () => {
      ac.abort();
      saveAbortRef.current?.abort();
      saveAbortRef.current = null;
      saveInFlightRef.current = false;
      identityRef.current = null;
    };
  }, [year, t.common.error]);

  async function save() {
    const ownerYear = year;
    const n = Number(draft);
    if (!Number.isSafeInteger(n) || n < 0 || n > READING_GOAL_TARGET_MAX) {
      toast.error(t.common.error);
      return;
    }
    if (saveInFlightRef.current) return;
    const controller = new AbortController();
    saveAbortRef.current?.abort();
    saveAbortRef.current = controller;
    saveInFlightRef.current = true;
    setBusy(true);
    try {
      const r = await fetch('/api/reading-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, target: n }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const goal = decodeReadingGoalMutationResponse(await r.json());
      if (!goal) throw new Error(t.common.error);
      if (identityRef.current !== ownerYear || saveAbortRef.current !== controller || controller.signal.aborted) return;
      setTarget(goal.target);
      setEditing(false);
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== ownerYear || saveAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerYear && saveAbortRef.current === controller) {
        saveAbortRef.current = null;
        saveInFlightRef.current = false;
        setBusy(false);
      }
    }
  }

  const pct = target && target > 0 ? Math.min(100, Math.round((finished / target) * 100)) : 0;

  return (
    <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-lg font-bold">
          <Target className="h-5 w-5 text-accent" aria-hidden /> {t.readingGoal.label} {year}
        </h2>
        {loaded && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="btn btn-xs btn-primary">
            {target == null ? t.readingGoal.setCta : t.common.edit}
          </button>
        )}
      </div>
      {!loaded ? (
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-1/3" />
          <SkeletonBlock className="h-2 w-full" />
        </div>
      ) : editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            disabled={busy}
            placeholder={t.readingGoal.placeholder}
            aria-label={t.readingGoal.label}
            className="input w-32"
          />
          <button type="button" onClick={save} disabled={busy} className="btn btn-xs btn-primary">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : t.common.save}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={busy} className="btn btn-xs">
            {t.common.cancel}
          </button>
        </div>
      ) : target == null ? (
        <p className="text-sm text-muted">{t.readingGoal.placeholder}</p>
      ) : (
        <div>
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-bold">{finished}/{target}</span>
            <span className="font-mono text-xs text-muted">{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t.readingGoal.label}
            className="h-2 w-full overflow-hidden rounded-full bg-bg-elev"
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}
