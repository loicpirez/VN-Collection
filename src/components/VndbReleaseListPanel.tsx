'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Cloud, KeyRound, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useConfirm } from './ConfirmDialog';
import { ErrorAlert } from './ErrorAlert';
import { SkeletonBlock, SkeletonBoundary } from './Skeleton';
import { useToast } from './ToastProvider';
import { readApiErrorLocalized, type KnownApiErrorCode } from '@/lib/api-error-read';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { useT } from '@/lib/i18n/client';
import {
  decodeVndbReleaseListClientState,
  type VndbReleaseListClientState,
} from '@/lib/vndb-ui-client-shape';
import type { VndbReleaseListStatus } from '@/lib/vndb-release-list-shape';

interface Props {
  releaseId: string;
  vnId: string;
  locallyOwned: boolean;
}

const STATUS_KEYS: Record<VndbReleaseListStatus, keyof Dictionary['releases']['vndbListStatuses']> = {
  0: 'unknown',
  1: 'pending',
  2: 'obtained',
  3: 'onLoan',
  4: 'deleted',
};

const STATUS_OPTIONS: Array<{ value: VndbReleaseListStatus; key: keyof Dictionary['releases']['vndbListStatuses'] }> = [
  { value: 0, key: 'unknown' },
  { value: 1, key: 'pending' },
  { value: 2, key: 'obtained' },
  { value: 3, key: 'onLoan' },
  { value: 4, key: 'deleted' },
];

function apiErrorMessages(t: Dictionary): Partial<Record<KnownApiErrorCode, string>> {
  return {
    vndb_token_required: t.apiErrors.vndbTokenRequired,
    vndb_listwrite_required: t.apiErrors.vndbListwriteRequired,
    vndb_unavailable: t.apiErrors.vndbUnavailable,
    upstream_unavailable: t.apiErrors.vndbUnavailable,
  };
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

/** Manage one edition in the authenticated user's VNDB release list. */
export function VndbReleaseListPanel({ releaseId, vnId, locallyOwned }: Props) {
  const t = useT();
  const toast = useToast();
  const { confirm } = useConfirm();
  const identity = `${releaseId}|${vnId}`;
  const identityRef = useRef(identity);
  const mountedRef = useRef(true);
  const loadAbortRef = useRef<AbortController | null>(null);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);
  const [state, setState] = useState<VndbReleaseListClientState | null>(null);
  const [selected, setSelected] = useState<VndbReleaseListStatus>(locallyOwned ? 2 : 0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  function ownsIdentity(ownerIdentity: string): boolean {
    return mountedRef.current && identityRef.current === ownerIdentity;
  }

  function beginMutation(): AbortController | null {
    if (mutationInFlightRef.current) return null;
    mutationInFlightRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    return controller;
  }

  function ownsMutation(ownerIdentity: string, controller: AbortController): boolean {
    return ownsIdentity(ownerIdentity) && mutationAbortRef.current === controller && !controller.signal.aborted;
  }

  function finishMutation(ownerIdentity: string, controller: AbortController): void {
    if (identityRef.current !== ownerIdentity || mutationAbortRef.current !== controller) return;
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    setBusy(null);
  }

  const load = useCallback(async (fresh: boolean): Promise<boolean> => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    const ownerIdentity = `${releaseId}|${vnId}`;
    loadAbortRef.current = controller;
    setLoading(true);
    try {
      const query = new URLSearchParams({ vn: vnId });
      if (fresh) query.set('fresh', '1');
      const response = await fetch(`/api/release/${releaseId}/vndb-list?${query.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(await readApiErrorLocalized(response, apiErrorMessages(t), t.common.error));
      }
      const nextState = decodeVndbReleaseListClientState(await response.json());
      if (!nextState) throw new Error(t.common.error);
      if (controller.signal.aborted || loadAbortRef.current !== controller || !ownsIdentity(ownerIdentity)) return false;
      setState(nextState);
      setSelected(nextState.status ?? (locallyOwned ? 2 : 0));
      setError(null);
      return true;
    } catch (loadError) {
      if (
        controller.signal.aborted ||
        loadAbortRef.current !== controller ||
        isAbortError(loadError)
      ) {
        return false;
      }
      setError(loadError instanceof Error && loadError.message ? loadError.message : t.common.error);
      return false;
    } finally {
      if (loadAbortRef.current === controller) {
        loadAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [locallyOwned, releaseId, t, vnId]);

  useEffect(() => {
    mountedRef.current = true;
    identityRef.current = identity;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    setState(null);
    setSelected(locallyOwned ? 2 : 0);
    setLoading(true);
    setBusy(null);
    setError(null);
    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
      mutationAbortRef.current?.abort();
      loadAbortRef.current = null;
      mutationAbortRef.current = null;
    };
  }, [identity, locallyOwned]);

  useEffect(() => {
    void load(false);
    return () => {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, [load]);

  async function save(): Promise<void> {
    const controller = beginMutation();
    if (!controller) return;
    const ownerIdentity = identity;
    setBusy('save');
    try {
      const response = await fetch(`/api/release/${releaseId}/vndb-list`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: selected }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(await readApiErrorLocalized(response, apiErrorMessages(t), t.common.error));
      }
      const nextState = decodeVndbReleaseListClientState(await response.json());
      if (!nextState || nextState.status === null) throw new Error(t.common.error);
      if (!ownsMutation(ownerIdentity, controller)) return;
      setState(nextState);
      setSelected(nextState.status);
      setError(null);
      toast.success(t.releases.vndbListSaved);
    } catch (saveError) {
      if (!ownsMutation(ownerIdentity, controller) || isAbortError(saveError)) return;
      toast.error(saveError instanceof Error && saveError.message ? saveError.message : t.common.error);
    } finally {
      finishMutation(ownerIdentity, controller);
    }
  }

  async function remove(): Promise<void> {
    const ownerIdentity = identity;
    const accepted = await confirm({ message: t.releases.vndbListRemoveConfirm, tone: 'danger' });
    if (!accepted || !ownsIdentity(ownerIdentity)) return;
    const controller = beginMutation();
    if (!controller) return;
    setBusy('remove');
    try {
      const response = await fetch(`/api/release/${releaseId}/vndb-list`, {
        method: 'DELETE',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(await readApiErrorLocalized(response, apiErrorMessages(t), t.common.error));
      }
      const nextState = decodeVndbReleaseListClientState(await response.json());
      if (!nextState || nextState.status !== null) throw new Error(t.common.error);
      if (!ownsMutation(ownerIdentity, controller)) return;
      setState(nextState);
      setSelected(locallyOwned ? 2 : 0);
      setError(null);
      toast.success(t.releases.vndbListRemoved);
    } catch (removeError) {
      if (!ownsMutation(ownerIdentity, controller) || isAbortError(removeError)) return;
      toast.error(removeError instanceof Error && removeError.message ? removeError.message : t.common.error);
    } finally {
      finishMutation(ownerIdentity, controller);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
            <Cloud className="h-4 w-4 text-accent" aria-hidden />
            {t.releases.vndbListTitle}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{t.releases.vndbListDescription}</p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading || busy !== null}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-bg-elev text-muted hover:border-accent hover:text-accent disabled:opacity-50 can-hover:sm:min-h-9 can-hover:sm:min-w-9"
          title={t.releases.vndbListRefresh}
          aria-label={t.releases.vndbListRefresh}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </header>

      {loading ? (
        <div className="mt-4" data-vndb-release-list-skeleton>
          <SkeletonBoundary label={t.common.loading}>
            <SkeletonBlock className="h-4 w-40 rounded" />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <SkeletonBlock className="h-11 min-w-0 flex-1 rounded-md" />
              <SkeletonBlock className="h-11 w-full rounded-md sm:w-40" />
            </div>
          </SkeletonBoundary>
        </div>
      ) : error ? (
        <div className="mt-4">
          <ErrorAlert title={t.common.error}>
            {error}
            <button type="button" onClick={() => void load(true)} className="btn btn-sm mt-2">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {t.common.retry}
            </button>
          </ErrorAlert>
        </div>
      ) : state?.needsAuth ? (
        <p className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-xs text-muted">
          <KeyRound className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          {t.vndbStatus.needsToken}
        </p>
      ) : state ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-baseline gap-2 text-xs">
            <span className="font-semibold text-muted">{t.releases.vndbListCurrent}</span>
            <span className="rounded-md border border-border bg-bg-elev px-2 py-1 font-semibold text-white/90">
              {state.status === null
                ? t.releases.vndbListNotListed
                : t.releases.vndbListStatuses[STATUS_KEYS[state.status]]}
            </span>
          </div>
          {locallyOwned && state.status === null && (
            <p className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-xs leading-relaxed text-muted">
              {t.releases.vndbListLocalOwnedHint}
            </p>
          )}
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
            <label className="min-w-0 flex-1 text-xs font-semibold text-muted">
              {t.releases.vndbListStatusLabel}
              <select
                value={selected}
                onChange={(event) => {
                  const option = STATUS_OPTIONS.find((candidate) => String(candidate.value) === event.target.value);
                  if (option) setSelected(option.value);
                }}
                disabled={busy !== null}
                className="mt-1 min-h-[44px] w-full rounded-md border border-border bg-bg-elev px-3 text-sm text-white outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t.releases.vndbListStatuses[option.key]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy !== null || state.status === selected}
                className="btn btn-primary min-h-[44px] justify-center disabled:opacity-50"
              >
                {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                {t.releases.vndbListSave}
              </button>
              {state.status !== null && (
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={busy !== null}
                  className="btn btn-danger min-h-[44px] justify-center disabled:opacity-50"
                >
                  {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                  {t.releases.vndbListRemove}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
