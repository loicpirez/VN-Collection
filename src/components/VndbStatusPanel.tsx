'use client';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useToast } from './ToastProvider';
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

  if (loading) return null;
  if (!state) return null;
  if (state.needsAuth) {
    return (
      <section className="rounded-xl border border-border bg-bg-card p-5">
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
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingLabel(null);
    }
  }

  async function clearAll() {
    if (!confirm(t.vndbStatus.removeConfirm)) return;
    setPendingClear(true);
    try {
      const r = await fetch(`/api/vn/${vnId}/vndb-status`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.removed);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingClear(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-bg-card p-5">
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

      <div className="flex flex-wrap gap-1.5">
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
