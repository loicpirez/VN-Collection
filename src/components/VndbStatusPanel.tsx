'use client';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ExternalLink, KeyRound, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { SkeletonBlock } from './Skeleton';
import { useT } from '@/lib/i18n/client';

interface Label {
  id: number;
  label: string;
  private: boolean;
  count?: number;
}

interface Entry {
  id: string;
  vote: number | null;
  started: string | null;
  finished: string | null;
  notes: string | null;
  labels: { id: number; label: string }[];
}

interface State {
  entry: Entry | null;
  labels: Label[];
  needsAuth: boolean;
}

/**
 * Shows the user's VNDB ulist labels for this VN (Wishlist / Playing /
 * Finished / Stalled / Dropped / Blacklist / Voted + custom). Each label is a
 * toggle that calls /api/vn/[id]/vndb-status (PATCH labels_set / labels_unset).
 * Hidden when no VNDB token is configured.
 */
export function VndbStatusPanel({ vnId }: { vnId: string }) {
  const t = useT();
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingLabel, setPendingLabel] = useState<number | null>(null);
  const [pendingClear, setPendingClear] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/vn/${vnId}/vndb-status`, { cache: 'no-store' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const d = (await r.json()) as State & { needsAuth?: boolean };
      setState({ entry: d.entry, labels: d.labels ?? [], needsAuth: !!d.needsAuth });
    } catch {
      // Silent — panel just hides itself if VNDB is unreachable.
    }
  }, [vnId, t.common.error]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
        <SkeletonBlock className="mb-3 h-4 w-32" />
        <SkeletonBlock className="mb-2 h-3 w-full" />
        <SkeletonBlock className="h-3 w-3/4" />
      </section>
    );
  }
  if (!state) return null;
  if (state.needsAuth) {
    return (
      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
        <h3 className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <KeyRound className="h-4 w-4 text-accent" /> {t.vndbStatus.section}
        </h3>
        <p className="text-xs text-muted">{t.vndbStatus.needsToken}</p>
      </section>
    );
  }

  const currentLabelIds = new Set((state.entry?.labels ?? []).map((l) => l.id));
  // VNDB's `Voted` label (id 7) is automatic, hide it from manual toggles.
  // Same with the user's custom-only labels (id >= 10) — keep them visible
  // since they may matter to the user.
  const togglable = state.labels.filter((l) => l.id !== 7);

  async function toggle(labelId: number) {
    const has = currentLabelIds.has(labelId);
    setPendingLabel(labelId);
    try {
      const r = await fetch(`/api/vn/${vnId}/vndb-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(has ? { labels_unset: [labelId] } : { labels_set: [labelId] }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.saved);
      await load();
      // Re-pull the server component so the rest of the VN page (status
      // badge, smart-status hint, activity timeline) reflects the new label.
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingLabel(null);
    }
  }

  async function clearAll() {
    const ok = await confirm({ message: t.vndbStatus.removeConfirm, tone: 'danger' });
    if (!ok) return;
    setPendingClear(true);
    try {
      const r = await fetch(`/api/vn/${vnId}/vndb-status`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.removed);
      await load();
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingClear(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <CheckCircle2 className="h-4 w-4 text-accent" /> {t.vndbStatus.section}
        </h3>
        <div className="flex items-center gap-1">
          <a
            href={`https://vndb.org/${vnId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
          >
            <ExternalLink className="h-3 w-3" />
            VNDB
          </a>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
            title={t.vndbStatus.refresh}
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            {t.vndbStatus.refresh}
          </button>
          {state.entry && (
            <button
              type="button"
              onClick={clearAll}
              disabled={pendingClear}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-dropped hover:text-status-dropped"
              title={t.vndbStatus.removeFromList}
            >
              {pendingClear ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {t.vndbStatus.removeFromList}
            </button>
          )}
        </div>
      </header>

      {state.entry && state.entry.vote != null && (
        <p className="mb-2 text-[11px] text-muted">
          {t.vndbStatus.currentVote}: <b className="text-accent">{(state.entry.vote / 10).toFixed(1)}/10</b>
        </p>
      )}

      <UlistDetailsEditor vnId={vnId} entry={state.entry} onSaved={load} />

      <div className="mt-3 flex flex-wrap gap-1.5">
        {togglable.map((l) => {
          const active = currentLabelIds.has(l.id);
          const isPredef = l.id < 10;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => toggle(l.id)}
              disabled={pendingLabel === l.id}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
                active
                  ? 'border-accent bg-accent/15 text-accent font-bold'
                  : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
              }`}
              title={isPredef ? t.vndbStatus.predefHint : t.vndbStatus.customHint}
            >
              {pendingLabel === l.id && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              {active && <CheckCircle2 className="h-3 w-3" aria-hidden />}
              {l.label}
              {l.private && (
                <span className="text-[9px] uppercase tracking-wider opacity-60">priv</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Vote / started / finished / notes writeback for the user's VNDB
 * list entry. Mirrors `PATCH /api/vn/[id]/vndb-status` accepting any
 * subset of those fields. Vote is stored on VNDB as a 10–100 integer
 * (1 decimal place); the UI lets the user type 0–10 with one decimal
 * to keep it intuitive. Empty string → null (clears the field).
 */
function UlistDetailsEditor({
  vnId,
  entry,
  onSaved,
}: {
  vnId: string;
  entry: Entry | null;
  onSaved: () => Promise<void>;
}) {
  const t = useT();
  const toast = useToast();
  const [vote, setVote] = useState<string>(entry?.vote != null ? (entry.vote / 10).toFixed(1) : '');
  const [started, setStarted] = useState<string>(entry?.started ?? '');
  const [finished, setFinished] = useState<string>(entry?.finished ?? '');
  const [notes, setNotes] = useState<string>(entry?.notes ?? '');
  const [saving, setSaving] = useState(false);
  // Tracks whether the user has touched any field since the last save
  // or initial mount. A parent re-fetch (label toggle, refresh button,
  // anything that re-runs the panel's `load()`) MUST NOT clobber
  // in-progress typing. Only sync from `entry` when the editor is
  // clean.
  const dirty = useRef(false);

  useEffect(() => {
    if (dirty.current) return;
    setVote(entry?.vote != null ? (entry.vote / 10).toFixed(1) : '');
    setStarted(entry?.started ?? '');
    setFinished(entry?.finished ?? '');
    setNotes(entry?.notes ?? '');
  }, [entry?.vote, entry?.started, entry?.finished, entry?.notes]);

  const markDirty = (setter: (v: string) => void) => (next: string) => {
    dirty.current = true;
    setter(next);
  };

  async function save() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      const trimmed = vote.trim();
      if (trimmed === '') {
        patch.vote = null;
      } else {
        const n = Math.round(Number(trimmed) * 10);
        if (!Number.isFinite(n) || n < 10 || n > 100) {
          toast.error(t.vndbStatus.voteRange);
          setSaving(false);
          return;
        }
        patch.vote = n;
      }
      patch.started = started.trim() || null;
      patch.finished = finished.trim() || null;
      patch.notes = notes.trim() || null;
      const r = await fetch(`/api/vn/${vnId}/vndb-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.saved);
      dirty.current = false;
      await onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="mt-3 rounded-lg border border-border bg-bg-elev/20 p-3 text-xs">
      <summary className="cursor-pointer text-muted hover:text-white">
        {t.vndbStatus.detailsToggle}
      </summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">{t.vndbStatus.fieldVote}</span>
          <input
            type="number"
            min={1}
            max={10}
            step={0.1}
            value={vote}
            onChange={(e) => markDirty(setVote)(e.target.value)}
            placeholder="—"
            className="rounded border border-border bg-bg px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">{t.vndbStatus.fieldStarted}</span>
          <input
            type="date"
            value={started || ''}
            onChange={(e) => markDirty(setStarted)(e.target.value)}
            className="rounded border border-border bg-bg px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">{t.vndbStatus.fieldFinished}</span>
          <input
            type="date"
            value={finished || ''}
            onChange={(e) => markDirty(setFinished)(e.target.value)}
            className="rounded border border-border bg-bg px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[10px] uppercase tracking-wider text-muted">{t.vndbStatus.fieldNotes}</span>
          <textarea
            value={notes}
            onChange={(e) => markDirty(setNotes)(e.target.value)}
            rows={3}
            className="resize-y rounded border border-border bg-bg px-2 py-1"
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {t.vndbStatus.detailsSave}
        </button>
      </div>
    </details>
  );
}
