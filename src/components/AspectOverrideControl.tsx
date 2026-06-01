'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { ASPECT_KEYS, type AspectKey } from '@/lib/aspect-ratio';

import { readApiError } from '@/lib/api-error-read';
import { decodeVnAspectClientState } from '@/lib/vn-detail-client-shape';
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
  const identityRef = useRef<string | null>(vnId);
  const loadAbortRef = useRef<AbortController | null>(null);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = vnId;
    setOverride(initialOverride ?? null);
    setDerived(initialDerived ?? 'unknown');
    setLoading(initialDerived === undefined);
    setSaving(false);
    return () => {
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      identityRef.current = null;
    };
  }, [vnId, initialDerived, initialOverride]);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const r = await fetch(`/api/vn/${vnId}/aspect`, { cache: 'no-store', signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const d = decodeVnAspectClientState(await r.json());
      if (!d) throw new Error(t.common.error);
      if (signal.aborted) return;
      setOverride(d.override);
      setDerived(d.derived);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [vnId, t.common.error]);

  useEffect(() => {
    const ac = new AbortController();
    loadAbortRef.current?.abort();
    loadAbortRef.current = ac;
    void load(ac.signal);
    return () => {
      ac.abort();
      if (loadAbortRef.current === ac) loadAbortRef.current = null;
    };
  }, [load]);

  async function save(next: AspectKey | null) {
    if (mutationInFlightRef.current) return;
    const ownerVnId = vnId;
    const controller = new AbortController();
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    mutationInFlightRef.current = true;
    mutationAbortRef.current = controller;
    setSaving(true);
    try {
      const r = await fetch(`/api/vn/${ownerVnId}/aspect`, {
        method: next ? 'PATCH' : 'DELETE',
        headers: next ? { 'Content-Type': 'application/json' } : undefined,
        body: next ? JSON.stringify({ aspect_key: next }) : undefined,
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const d = decodeVnAspectClientState(await r.json());
      if (!d) throw new Error(t.common.error);
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setOverride(d.override);
      setDerived(d.derived);
      toast.success(t.toast.saved);
    } catch (e) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setSaving(false);
      }
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy
        className="p-3 text-xs text-muted"
      >
        <Loader2 className="inline h-3 w-3 animate-spin" aria-hidden /> {t.common.loading}
      </div>
    );
  }

  const activeKey = override?.aspect_key ?? derived;
  const isManual = !!override;
  return (
    <div className="p-3 sm:p-4">
      <p className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-muted">
        <span>{t.aspectOverride.description}</span>
        <span className="text-[10px]">
          {isManual ? t.aspectOverride.sourceManual : t.aspectOverride.sourceDerived}
          {' / '}
          <span className="font-mono text-accent">{activeKey}</span>
        </span>
      </p>
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
              className={`inline-flex min-h-[44px] items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
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
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-dropped hover:text-status-dropped"
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
    </div>
  );
}
