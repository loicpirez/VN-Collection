'use client';
import { useCallback, useEffect, useState } from 'react';
import { Monitor, Loader2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { ASPECT_KEYS, type AspectKey } from '@/lib/aspect-ratio';

/**
 * Per-VN aspect-ratio override + display. Surfaces the currently
 * derived aspect (manual / per-edition / cached release resolution /
 * VN screenshot dims) and lets the user pin a specific bucket
 * regardless of what the data says.
 *
 * Use case: VNDB has no release with a usable resolution but the
 * game is obviously 16:9 (or the cached resolution is wrong for the
 * common edition the user actually plays).
 */
export function AspectOverrideControl({
  vnId,
  initialDerived,
  initialOverride,
}: {
  vnId: string;
  /**
   * SSR-pre-derived aspect, passed from the VN page so the control
   * paints the right value on first frame instead of flashing
   * "Auto · unknown" while the client fetch is in flight.
   */
  initialDerived?: AspectKey;
  initialOverride?: { aspect_key: AspectKey; note: string | null } | null;
}) {
  const t = useT();
  const toast = useToast();
  const [override, setOverride] = useState<{ aspect_key: AspectKey; note: string | null } | null>(
    initialOverride ?? null,
  );
  const [derived, setDerived] = useState<AspectKey>(initialDerived ?? 'unknown');
  // Skip the initial loading flash when the server already gave us
  // a derived value. Re-fetch on mount anyway so manual overrides
  // saved in a different tab / earlier session show up.
  const [loading, setLoading] = useState(initialDerived === undefined);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const ac = new AbortController();
    try {
      const r = await fetch(`/api/vn/${vnId}/aspect`, { cache: 'no-store', signal: ac.signal });
      if (!r.ok) throw new Error(await r.text());
      const d = (await r.json()) as {
        override: { aspect_key: AspectKey; note: string | null } | null;
        derived: AspectKey;
      };
      if (ac.signal.aborted) return;
      setOverride(d.override);
      setDerived(d.derived);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      // Soft-fail — control just stays in loading state and any
      // future tab visit retries.
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
    return () => ac.abort();
  }, [vnId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: AspectKey | null) {
    setSaving(true);
    try {
      const r = await fetch(`/api/vn/${vnId}/aspect`, {
        method: next ? 'PATCH' : 'DELETE',
        headers: next ? { 'Content-Type': 'application/json' } : undefined,
        body: next ? JSON.stringify({ aspect_key: next }) : undefined,
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const d = (await r.json()) as {
        override: { aspect_key: AspectKey; note: string | null } | null;
        derived: AspectKey;
      };
      setOverride(d.override);
      setDerived(d.derived);
      toast.success(t.toast.saved);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-bg-card p-3 text-xs text-muted">
        <Loader2 className="inline h-3 w-3 animate-spin" aria-hidden /> {t.common.loading}
      </section>
    );
  }

  const activeKey = override?.aspect_key ?? derived;
  const isManual = !!override;
  return (
    <section className="rounded-xl border border-border bg-bg-card p-3 sm:p-4">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <Monitor className="h-3.5 w-3.5 text-accent" aria-hidden /> {t.aspectOverride.title}
        </h3>
        <span className="text-[10px] text-muted">
          {isManual ? t.aspectOverride.sourceManual : t.aspectOverride.sourceDerived}
          {' · '}
          <span className="font-mono text-accent">{activeKey}</span>
        </span>
      </header>
      <p className="mb-2 text-[11px] text-muted">{t.aspectOverride.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {ASPECT_KEYS.filter((k) => k !== 'unknown').map((k) => {
          const active = override?.aspect_key === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => save(active ? null : k)}
              disabled={saving}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
                active
                  ? 'border-accent bg-accent/15 text-accent font-bold'
                  : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
              }`}
            >
              {k}
            </button>
          );
        })}
        {isManual && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-dropped hover:text-status-dropped"
          >
            <X className="h-3 w-3" aria-hidden />
            {t.aspectOverride.clear}
          </button>
        )}
      </div>
      {derived !== 'unknown' && override && override.aspect_key !== derived && (
        <p className="mt-2 text-[10px] text-muted">
          {t.aspectOverride.derivedHint.replace('{key}', derived)}
        </p>
      )}
      {derived === 'unknown' && !override && (
        <p className="mt-2 text-[10px] text-muted">{t.aspectOverride.noDataHint}</p>
      )}
    </section>
  );
}
