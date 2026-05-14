'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Target } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

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

  useEffect(() => {
    fetch(`/api/reading-goal?year=${year}`)
      .then((r) => r.json())
      .then((d: { goal?: { target: number } | null; finished?: number }) => {
        setTarget(d.goal?.target ?? null);
        setFinished(d.finished ?? 0);
        setDraft(String(d.goal?.target ?? ''));
      })
      .catch(() => undefined);
  }, [year]);

  async function save() {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) {
      toast.error(t.common.error);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/reading-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, target: n }),
      });
      if (!r.ok) throw new Error(t.common.error);
      const d = (await r.json()) as { goal: { target: number } };
      setTarget(d.goal.target);
      setEditing(false);
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pct = target && target > 0 ? Math.min(100, Math.round((finished / target) * 100)) : 0;

  return (
    <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-lg font-bold">
          <Target className="h-5 w-5 text-accent" /> {t.readingGoal.label} {year}
        </h2>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="btn btn-primary text-xs">
            {target == null ? t.readingGoal.setCta : t.common.edit}
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            placeholder={t.readingGoal.placeholder}
            className="input w-32"
          />
          <button type="button" onClick={save} disabled={busy} className="btn btn-primary text-xs">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : t.common.save}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn text-xs">
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
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-elev">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}
