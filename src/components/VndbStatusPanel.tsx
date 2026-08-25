'use client';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownToLine, ArrowUpToLine, CheckCircle2, ExternalLink, KeyRound, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { DateInput } from './DateInput';
import { SkeletonBlock } from './Skeleton';
import { useT, useLocale } from '@/lib/i18n/client';
import { CollapsibleSummary } from './CollapsibleSummary';
import { ErrorAlert } from './ErrorAlert';
import { EGS_CHANGED_EVENT, type EgsChangedDetail } from './EgsPanel';
import { fmtNum } from '@/lib/locale-number';

import { readApiErrorLocalized, type KnownApiErrorCode } from '@/lib/api-error-read';
import { decodeVndbStatusClientState, type VndbStatusClientState } from '@/lib/vndb-ui-client-shape';
import { clearVndbStatusRequest, requestVndbStatus } from '@/lib/vndb-status-client';
import type { VndbUlistEntryDetail } from '@/lib/vndb';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import type { Status } from '@/lib/types';
import type { VndbSyncField, VndbUserDataDifference } from '@/lib/vndb-user-data-sync';

/**
 * Maps the API routes' stable error codes to the active locale's
 * dictionary strings so a failed VNDB list mutation surfaces a
 * localized toast instead of the route's verbatim English text.
 */
function apiErrorMessages(t: Dictionary): Partial<Record<KnownApiErrorCode, string>> {
  return {
    vndb_token_required: t.apiErrors.vndbTokenRequired,
    vndb_unavailable: t.apiErrors.vndbUnavailable,
    vndb_sync_changed: t.apiErrors.vndbSyncChanged,
    vndb_sync_direction_unavailable: t.apiErrors.vndbSyncDirectionUnavailable,
    steam_sync_failed: t.apiErrors.steamSyncFailed,
    steam_not_configured: t.apiErrors.steamNotConfigured,
    egs_game_not_found: t.apiErrors.egsGameNotFound,
  };
}

/**
 * Shows the user's VNDB ulist labels for this VN (Wishlist / Playing /
 * Finished / Stalled / Dropped / Blacklist / Voted + custom). Each label is a
 * toggle that calls /api/vn/[id]/vndb-status (PATCH labels_set / labels_unset).
 * Hidden when no VNDB token is configured.
 */
export function VndbStatusPanel({ vnId }: { vnId: string }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, setState] = useState<VndbStatusClientState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingLabel, setPendingLabel] = useState<number | null>(null);
  const [pendingClear, setPendingClear] = useState(false);
  const [pendingSync, setPendingSync] = useState<'local_to_vndb' | 'vndb_to_local' | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);
  const identityRef = useRef(vnId);
  const mountedRef = useRef(true);

  function ownsPanel(ownerVnId: string): boolean {
    return mountedRef.current && identityRef.current === ownerVnId;
  }

  function beginMutation(): AbortController | null {
    if (mutationInFlightRef.current) return null;
    mutationInFlightRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    return controller;
  }

  function ownsMutation(ownerVnId: string, controller: AbortController): boolean {
    return ownsPanel(ownerVnId) && mutationAbortRef.current === controller && !controller.signal.aborted;
  }

  function finishMutation(ownerVnId: string, controller: AbortController) {
    if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller) return;
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    setPendingLabel(null);
    setPendingClear(false);
    setPendingSync(null);
  }

  const load = useCallback(async (showLoading: boolean, fresh = false): Promise<boolean> => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    if (showLoading) setLoading(true);
    try {
      if (fresh) clearVndbStatusRequest(vnId);
      const r = await requestVndbStatus(vnId, fresh);
      if (!r.ok) throw new Error(await readApiErrorLocalized(r, apiErrorMessages(t), t.common.error));
      const d = decodeVndbStatusClientState(await r.json());
      if (!d) throw new Error(t.common.error);
      if (controller.signal.aborted || loadAbortRef.current !== controller) return false;
      setState(d);
      setError(null);
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError' || controller.signal.aborted || loadAbortRef.current !== controller) {
        return false;
      }
      setError((e as Error).message || t.common.error);
      return false;
    } finally {
      if (loadAbortRef.current === controller) {
        loadAbortRef.current = null;
        if (showLoading) setLoading(false);
      }
    }
  }, [vnId, t.common.error]);

  useEffect(() => {
    mountedRef.current = true;
    identityRef.current = vnId;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    setState(null);
    setError(null);
    setLoading(true);
    setPendingLabel(null);
    setPendingClear(false);
    setPendingSync(null);
    return () => {
      mountedRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [vnId]);

  useEffect(() => {
    void load(true);
    return () => {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      clearVndbStatusRequest(vnId);
    };
  }, [load, vnId]);

  useEffect(() => {
    function onEgsChanged(e: Event) {
      const detail = (e as CustomEvent<EgsChangedDetail>).detail;
      if (detail && detail.vnId !== vnId) return;
      void load(false, true);
    }
    window.addEventListener(EGS_CHANGED_EVENT, onEgsChanged);
    return () => window.removeEventListener(EGS_CHANGED_EVENT, onEgsChanged);
  }, [load, vnId]);

  const reload = useCallback(() => {
    void load(true, true);
  }, [load]);

  if (loading) {
    return (
      <div className="p-4 sm:p-5">
        <SkeletonBlock className="mb-3 h-4 w-32" />
        <SkeletonBlock className="mb-2 h-3 w-full" />
        <SkeletonBlock className="h-3 w-3/4" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 sm:p-5">
        <ErrorAlert title={t.common.error}>
          {error}
          <button type="button" onClick={reload} className="btn btn-sm mt-2">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t.common.retry}
          </button>
        </ErrorAlert>
      </div>
    );
  }
  if (!state) return null;
  if (state.needsAuth) {
    return (
      <div className="p-4 sm:p-5">
        <p className="inline-flex items-center gap-2 text-xs text-muted">
          <KeyRound className="h-4 w-4 text-accent" aria-hidden /> {t.vndbStatus.needsToken}
        </p>
      </div>
    );
  }

  const currentLabelIds = new Set((state.entry?.labels ?? []).map((l) => l.id));
  const mutationBusy = pendingLabel != null || pendingClear || pendingSync != null;
  // VNDB's `Voted` label (id 7) is automatic, hide it from manual toggles.
  // Same with the user's custom-only labels (id >= 10) - keep them visible
  // since they may matter to the user.
  const togglable = state.labels.filter((l) => l.id !== 7);

  async function toggle(labelId: number) {
    const controller = beginMutation();
    if (!controller) return;
    const ownerVnId = vnId;
    const has = currentLabelIds.has(labelId);
    setPendingLabel(labelId);
    try {
      const r = await fetch(`/api/vn/${vnId}/vndb-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(has ? { labels_unset: [labelId] } : { labels_set: [labelId] }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiErrorLocalized(r, apiErrorMessages(t), t.common.error));
      if (!ownsMutation(ownerVnId, controller)) return;
      toast.success(t.toast.saved);
      await load(false, true);
      if (!ownsMutation(ownerVnId, controller)) return;
      // Re-pull the server component so the rest of the VN page (status
      // badge, smart-status hint, activity timeline) reflects the new label.
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerVnId, controller) || (e instanceof Error && e.name === 'AbortError')) return;
      toast.error((e as Error).message);
    } finally {
      finishMutation(ownerVnId, controller);
    }
  }

  async function clearAll() {
    const ownerVnId = vnId;
    const controller = beginMutation();
    if (!controller) return;
    setPendingClear(true);
    try {
      const ok = await confirm({ message: t.vndbStatus.removeConfirm, tone: 'danger' });
      if (!ok || !ownsMutation(ownerVnId, controller)) return;
      const r = await fetch(`/api/vn/${vnId}/vndb-status`, {
        method: 'DELETE',
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiErrorLocalized(r, apiErrorMessages(t), t.common.error));
      if (!ownsMutation(ownerVnId, controller)) return;
      toast.success(t.toast.removed);
      await load(false, true);
      if (!ownsMutation(ownerVnId, controller)) return;
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerVnId, controller) || (e instanceof Error && e.name === 'AbortError')) return;
      toast.error((e as Error).message);
    } finally {
      finishMutation(ownerVnId, controller);
    }
  }

  async function resolveDifferences(
    direction: 'local_to_vndb' | 'vndb_to_local',
    differences: VndbUserDataDifference[],
  ) {
    const controller = beginMutation();
    if (!controller) return;
    const ownerVnId = vnId;
    setPendingSync(direction);
    try {
      const response = await fetch(`/api/vn/${vnId}/vndb-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction,
          selections: differences.map(({ field, local, remote }) => ({ field, local, remote })),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const shouldReload = response.status === 409;
        const message = await readApiErrorLocalized(response, apiErrorMessages(t), t.common.error);
        if (shouldReload && ownsMutation(ownerVnId, controller)) await load(false, true);
        throw new Error(message);
      }
      if (!ownsMutation(ownerVnId, controller)) return;
      toast.success(t.toast.saved);
      await load(false, true);
      if (!ownsMutation(ownerVnId, controller)) return;
      startTransition(() => router.refresh());
    } catch (error) {
      if (!ownsMutation(ownerVnId, controller) || (error instanceof Error && error.name === 'AbortError')) return;
      toast.error((error as Error).message);
    } finally {
      finishMutation(ownerVnId, controller);
    }
  }

  function fieldLabel(field: VndbSyncField): string {
    if (field === 'status') return t.vndbStatus.fieldStatus;
    if (field === 'vote') return t.vndbStatus.fieldVote;
    if (field === 'started') return t.vndbStatus.fieldStarted;
    if (field === 'finished') return t.vndbStatus.fieldFinished;
    return t.vndbStatus.fieldNotes;
  }

  function displayValue(field: VndbSyncField, value: Status | number | string | null): string {
    if (value === null) return t.vndbStatus.noValue;
    if (field === 'status') return t.status[value as Status];
    if (field === 'vote') return `${fmtNum((value as number) / 10, locale, 1)}/10`;
    return String(value);
  }

  const pushableDifferences = state.differences.filter((difference) => difference.canPushLocal);
  const pullableDifferences = state.differences.filter((difference) => difference.canPullRemote);

  return (
    <div className="p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1">
          <a
            href={`https://vndb.org/${vnId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent can-hover:sm:min-h-0"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            VNDB
          </a>
          <button
            type="button"
            onClick={() => void load(false, true)}
            disabled={mutationBusy}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent can-hover:sm:min-h-0"
            title={t.vndbStatus.refresh}
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            {t.vndbStatus.refresh}
          </button>
          {state.entry && (
            <button
              type="button"
              onClick={clearAll}
              disabled={mutationBusy}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-dropped hover:text-status-dropped can-hover:sm:min-h-0"
              title={t.vndbStatus.removeFromList}
            >
              {pendingClear ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Trash2 className="h-3 w-3" aria-hidden />}
              {t.vndbStatus.removeFromList}
            </button>
          )}
        </div>
      </header>

      {state.entry && state.entry.vote != null && (
        <p className="mb-2 text-[11px] text-muted">
          {t.vndbStatus.currentVote}: <b className="text-accent">{fmtNum(state.entry.vote / 10, locale, 1)}/10</b>
        </p>
      )}

      {state.local && state.differences.length > 0 && (
        <section className="mb-3 border-y border-status-on-hold/35 bg-status-on-hold/5 py-3" aria-labelledby={`vndb-conflicts-${vnId}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 id={`vndb-conflicts-${vnId}`} className="text-xs font-bold text-status-on-hold">
                {t.vndbStatus.conflictTitle}
              </h3>
              <p className="mt-0.5 text-[10px] text-muted">{t.vndbStatus.conflictDesc}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pushableDifferences.length > 1 && (
                <button
                  type="button"
                  className="btn btn-sm min-h-[44px] can-hover:sm:min-h-0"
                  disabled={mutationBusy}
                  onClick={() => void resolveDifferences('local_to_vndb', pushableDifferences)}
                >
                  {pendingSync === 'local_to_vndb' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ArrowUpToLine className="h-3.5 w-3.5" aria-hidden />}
                  {t.vndbStatus.useAllLocal}
                </button>
              )}
              {pullableDifferences.length > 1 && (
                <button
                  type="button"
                  className="btn btn-sm min-h-[44px] can-hover:sm:min-h-0"
                  disabled={mutationBusy}
                  onClick={() => void resolveDifferences('vndb_to_local', pullableDifferences)}
                >
                  {pendingSync === 'vndb_to_local' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />}
                  {t.vndbStatus.useAllRemote}
                </button>
              )}
            </div>
          </div>
          <ul className="mt-3 divide-y divide-border/60">
            {state.differences.map((difference) => (
              <li key={difference.field} className="grid min-w-0 gap-2 py-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                <span className="text-[10px] font-bold uppercase text-muted">{fieldLabel(difference.field)}</span>
                <div className="min-w-0">
                  <span className="block text-[9px] uppercase text-muted/70">{t.vndbStatus.localValue}</span>
                  <span className="line-clamp-3 break-words whitespace-pre-wrap text-xs">{displayValue(difference.field, difference.local)}</span>
                </div>
                <div className="min-w-0">
                  <span className="block text-[9px] uppercase text-muted/70">{t.vndbStatus.remoteValue}</span>
                  <span className="line-clamp-3 break-words whitespace-pre-wrap text-xs">{displayValue(difference.field, difference.remote)}</span>
                </div>
                <div className="flex flex-wrap gap-1 sm:justify-end">
                  <button
                    type="button"
                    className="tap-target inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-[10px] hover:border-accent hover:text-accent"
                    disabled={mutationBusy || !difference.canPushLocal}
                    title={!difference.canPushLocal ? t.vndbStatus.syncBlockedNoteLength : t.vndbStatus.useLocal}
                    onClick={() => void resolveDifferences('local_to_vndb', [difference])}
                  >
                    <ArrowUpToLine className="h-3.5 w-3.5" aria-hidden />
                    {t.vndbStatus.useLocal}
                  </button>
                  <button
                    type="button"
                    className="tap-target inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-[10px] hover:border-accent hover:text-accent"
                    disabled={mutationBusy || !difference.canPullRemote}
                    title={!difference.canPullRemote ? t.vndbStatus.syncBlockedNoStatus : t.vndbStatus.useRemote}
                    onClick={() => void resolveDifferences('vndb_to_local', [difference])}
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
                    {t.vndbStatus.useRemote}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <UlistDetailsEditor vnId={vnId} entry={state.entry} disabled={mutationBusy} onSaved={async () => { await load(false, true); }} />

      <div className="mt-3 flex flex-wrap gap-1.5">
        {togglable.map((l) => {
          const active = currentLabelIds.has(l.id);
          const isPredef = l.id < 10;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => toggle(l.id)}
              disabled={mutationBusy}
              // aria-pressed mirrors the visual on/off state for SR
              // users - the toggle's color/icon difference was the
              aria-pressed={active}
              className={`inline-flex min-h-[44px] items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 can-hover:sm:min-h-0 ${
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
                <span className="text-[9px] uppercase tracking-wider opacity-60">{t.vndbStatus.privateBadge}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Vote / started / finished / notes writeback for the user's VNDB
 * list entry. Mirrors `PATCH /api/vn/[id]/vndb-status` accepting any
 * subset of those fields. Vote is stored on VNDB as a 10-100 integer
 * (1 decimal place); the UI lets the user type 0-10 with one decimal
 * to keep it intuitive. Empty string -> null (clears the field).
 */
function UlistDetailsEditor({
  vnId,
  entry,
  disabled,
  onSaved,
}: {
  vnId: string;
  entry: VndbUlistEntryDetail | null;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [vote, setVote] = useState<string>(entry?.vote != null ? fmtNum(entry.vote / 10, locale, 1) : '');
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
  const identityRef = useRef(vnId);
  const mountedRef = useRef(true);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    identityRef.current = vnId;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    dirty.current = false;
    setVote(entry?.vote != null ? fmtNum(entry.vote / 10, locale, 1) : '');
    setStarted(entry?.started ?? '');
    setFinished(entry?.finished ?? '');
    setNotes(entry?.notes ?? '');
    setSaving(false);
    return () => {
      mountedRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [vnId]);

  useEffect(() => {
    if (dirty.current) return;
    setVote(entry?.vote != null ? fmtNum(entry.vote / 10, locale, 1) : '');
    setStarted(entry?.started ?? '');
    setFinished(entry?.finished ?? '');
    setNotes(entry?.notes ?? '');
  }, [entry?.vote, entry?.started, entry?.finished, entry?.notes, locale]);

  const markDirty = (setter: (v: string) => void) => (next: string) => {
    dirty.current = true;
    setter(next);
  };

  async function save() {
    if (mutationInFlightRef.current) return;
    const ownerVnId = vnId;
    let controller: AbortController | null = null;
    try {
      const patch: Record<string, unknown> = {};
      const trimmed = vote.trim();
      if (trimmed === '') {
        patch.vote = null;
      } else {
        const n = Math.round(Number(trimmed) * 10);
        if (!Number.isFinite(n) || n < 10 || n > 100) {
          toast.error(t.vndbStatus.voteRange);
          return;
        }
        patch.vote = n;
      }
      patch.started = started.trim() || null;
      patch.finished = finished.trim() || null;
      patch.notes = notes.trim() || null;
      mutationInFlightRef.current = true;
      controller = new AbortController();
      mutationAbortRef.current = controller;
      setSaving(true);
      const r = await fetch(`/api/vn/${vnId}/vndb-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiErrorLocalized(r, apiErrorMessages(t), t.common.error));
      if (controller.signal.aborted || !mountedRef.current || identityRef.current !== ownerVnId || mutationAbortRef.current !== controller) return;
      toast.success(t.toast.saved);
      dirty.current = false;
      await onSaved();
      if (controller.signal.aborted || !mountedRef.current || identityRef.current !== ownerVnId || mutationAbortRef.current !== controller) return;
    } catch (e) {
      if (!controller || (e as Error).name === 'AbortError' || controller.signal.aborted || !mountedRef.current || identityRef.current !== ownerVnId || mutationAbortRef.current !== controller) return;
      toast.error((e as Error).message);
    } finally {
      if (controller && identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setSaving(false);
      }
    }
  }

  return (
    <details className="group mt-3 rounded-lg border border-border bg-bg-elev/20 p-3 text-xs">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center text-muted hover:text-white can-hover:sm:min-h-0 [&::-webkit-details-marker]:hidden">
        <CollapsibleSummary>{t.vndbStatus.detailsToggle}</CollapsibleSummary>
      </summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">{t.vndbStatus.fieldVote}</span>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={10}
            step={0.1}
            value={vote}
            onChange={(e) => markDirty(setVote)(e.target.value)}
            placeholder="-"
            className="min-h-[44px] rounded border border-border bg-bg px-2 py-1 can-hover:sm:min-h-0"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">{t.vndbStatus.fieldStarted}</span>
          {/*
            DateInput formats per the app's `useLocale()` (fr-FR / en-US / ja-JP)
            instead of inheriting the OS / browser locale that a raw
            <input type="date"> uses - so a French-speaking user on a Japanese
            OS no longer sees kanji-formatted dates in their VNDB list editor.
            Value stays as ISO YYYY-MM-DD on the wire, which is what the VNDB
            PATCH /ulist endpoint expects.
          */}
          <DateInput
            value={started || ''}
            onChange={markDirty(setStarted)}
            ariaLabel={t.vndbStatus.fieldStarted}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">{t.vndbStatus.fieldFinished}</span>
          <DateInput
            value={finished || ''}
            onChange={markDirty(setFinished)}
            ariaLabel={t.vndbStatus.fieldFinished}
            className="input"
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
          disabled={saving || disabled}
          className="btn"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {t.vndbStatus.detailsSave}
        </button>
      </div>
    </details>
  );
}
