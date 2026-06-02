'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, Unlink, Search, ArrowRightLeft } from 'lucide-react';
import { useDialogA11y } from './Dialog';
import { useT } from '@/lib/i18n/client';
import { useConfirm } from './ConfirmDialog';
import { SkeletonRows } from './Skeleton';
import type { PlaceWithLinks } from '@/lib/db';
import {
  decodeOtherPlaceBranchesResponse,
  decodeUnassignedBranchesResponse,
  type OtherPlaceBranch,
} from '@/lib/place-client-shape';
import { readApiError } from '@/lib/api-error-read';

interface Props {
  place: PlaceWithLinks;
  onClose: () => void;
  onSaved: () => void;
}

export function AssignProviderDialog({ place, onClose, onSaved }: Props) {
  const t = useT();
  const { confirm } = useConfirm();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialogA11y({ open: true, onClose, panelRef });

  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [linked, setLinked] = useState<string[]>(place.provider_labels);
  const [others, setOthers] = useState<OtherPlaceBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const placeIdentityRef = useRef<number | null>(place.id);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationRef = useRef(false);
  const linkedIdentity = JSON.stringify(place.provider_labels);

  const refresh = useCallback(async () => {
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    const { signal } = controller;
    const ownerId = place.id;
    setLoading(true);
    setError(null);
    try {
      const [uRes, oRes] = await Promise.all([
        fetch('/api/places/unassigned', { cache: 'no-store', signal }),
        fetch(`/api/places/${place.id}/other-branches`, { cache: 'no-store', signal }),
      ]);
      if (!uRes.ok) throw new Error(await readApiError(uRes, t.common.error as string));
      if (!oRes.ok) throw new Error(await readApiError(oRes, t.common.error as string));
      const [unassignedRows, otherRows] = await Promise.all([
        uRes.json().then(decodeUnassignedBranchesResponse),
        oRes.json().then(decodeOtherPlaceBranchesResponse),
      ]);
      if (!unassignedRows || !otherRows) throw new Error(t.common.error as string);
      if (signal.aborted || placeIdentityRef.current !== ownerId || refreshAbortRef.current !== controller) return;
      setUnassigned(unassignedRows);
      setOthers(otherRows);
    } catch (error) {
      if (signal.aborted || error instanceof Error && error.name === 'AbortError') return;
      if (placeIdentityRef.current !== ownerId || refreshAbortRef.current !== controller) return;
      setError(error instanceof Error ? error.message : t.common.error as string);
    } finally {
      if (!signal.aborted && placeIdentityRef.current === ownerId && refreshAbortRef.current === controller) setLoading(false);
    }
  }, [place.id, t.common.error]);

  useEffect(() => {
    placeIdentityRef.current = place.id;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationRef.current = false;
    setLinked(place.provider_labels);
    setUnassigned([]);
    setOthers([]);
    setLoading(true);
    setBusy(null);
    setSearch('');
    setError(null);
    void refresh();
    return () => {
      placeIdentityRef.current = null;
      mutationRef.current = false;
      refreshAbortRef.current?.abort();
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [place.id, linkedIdentity, refresh]);

  function beginMutation(): AbortController | null {
    if (mutationRef.current) return null;
    mutationRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    return controller;
  }

  function ownsMutation(ownerId: number, controller: AbortController): boolean {
    return placeIdentityRef.current === ownerId
      && mutationAbortRef.current === controller
      && !controller.signal.aborted;
  }

  function finishMutation(ownerId: number, controller: AbortController) {
    if (placeIdentityRef.current !== ownerId || mutationAbortRef.current !== controller) return;
    mutationAbortRef.current = null;
    mutationRef.current = false;
    setBusy(null);
  }

  async function link(label: string) {
    const controller = beginMutation();
    if (!controller) return;
    const ownerId = place.id;
    setBusy(label);
    setError(null);
    try {
      const r = await fetch(`/api/places/${place.id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_label: label }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error as string));
      if (!ownsMutation(ownerId, controller)) return;
      setLinked((prev) => (prev.includes(label) ? prev : [...prev, label]));
      setUnassigned((prev) => prev.filter((b) => b !== label));
      onSaved();
    } catch (error) {
      if (ownsMutation(ownerId, controller)) setError(error instanceof Error ? error.message : t.common.error as string);
    } finally {
      finishMutation(ownerId, controller);
    }
  }

  async function unlink(label: string) {
    const controller = beginMutation();
    if (!controller) return;
    const ownerId = place.id;
    setBusy(label);
    setError(null);
    try {
      const r = await fetch(`/api/places/${place.id}/link`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_label: label }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error as string));
      if (!ownsMutation(ownerId, controller)) return;
      setLinked((prev) => prev.filter((b) => b !== label));
      setUnassigned((prev) => [...prev, label].sort((a, b) => a.localeCompare(b)));
      onSaved();
    } catch (error) {
      if (ownsMutation(ownerId, controller)) setError(error instanceof Error ? error.message : t.common.error as string);
    } finally {
      finishMutation(ownerId, controller);
    }
  }

  async function moveFromOther(branch: OtherPlaceBranch) {
    const controller = beginMutation();
    if (!controller) return;
    const ownerId = place.id;
    setBusy(branch.provider_label);
    try {
      const ok = await confirm({
        message: (t.places.moveConfirm as string)
          .replace('{label}', branch.provider_label)
          .replace('{from}', branch.place_name)
          .replace('{to}', place.name),
        tone: 'danger',
      });
      if (!ok || !ownsMutation(ownerId, controller)) return;
      setError(null);
      const r = await fetch(`/api/places/${place.id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_label: branch.provider_label, from_place_id: branch.place_id }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error as string));
      if (!ownsMutation(ownerId, controller)) return;
      setLinked((prev) => (prev.includes(branch.provider_label) ? prev : [...prev, branch.provider_label]));
      setOthers((prev) => prev.filter((b) => !(b.provider_label === branch.provider_label && b.place_id === branch.place_id)));
      onSaved();
    } catch (error) {
      if (ownsMutation(ownerId, controller)) setError(error instanceof Error ? error.message : t.common.error as string);
    } finally {
      finishMutation(ownerId, controller);
    }
  }

  const q = search.trim().toLowerCase();
  const filteredLinked = useMemo(
    () => (q ? linked.filter((l) => l.toLowerCase().includes(q)) : linked),
    [linked, q],
  );
  const filteredUnassigned = useMemo(
    () => (q ? unassigned.filter((b) => b.toLowerCase().includes(q)) : unassigned),
    [unassigned, q],
  );
  const filteredOthers = useMemo(
    () =>
      q
        ? others.filter(
            (o) =>
              o.provider_label.toLowerCase().includes(q) ||
              o.place_name.toLowerCase().includes(q),
          )
        : others,
    [others, q],
  );

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-bg/80 backdrop-blur" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.places.assignDialog as string}
        tabIndex={-1}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-bg-card p-6 shadow-card outline-none overflow-y-auto max-h-[90vh]"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-white">{t.places.assignDialog as string}</h2>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn tap-target text-muted hover:text-white"
            aria-label={t.common.close as string}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="text-[11px] text-muted mb-3">{place.name}</p>
        <p className="text-[11px] text-muted mb-3">{t.places.assignDialogHint as string}</p>

        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
          <input
            className="input min-h-[44px] w-full pl-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.places.assignSearchPlaceholder as string}
            aria-label={t.places.assignSearchPlaceholder as string}
          />
        </div>

        {error && (
          <p role="alert" className="mb-3 rounded border border-status-dropped/40 bg-status-dropped/10 px-3 py-2 text-xs text-status-dropped">
            {error}
          </p>
        )}

        {filteredLinked.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-accent mb-2">
              {(t.places.tabLinked as string)} ({filteredLinked.length})
            </p>
            <ul className="space-y-1">
              {filteredLinked.map((label) => (
                <li key={label} className="flex items-center justify-between gap-2 rounded border border-accent/30 bg-accent/5 px-3 py-2">
                  <span className="text-xs text-white truncate">{label}</span>
                  <button
                    type="button"
                    onClick={() => unlink(label)}
                    disabled={busy !== null}
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1 text-[10px] text-muted hover:text-red-400 sm:min-h-0"
                  >
                    <Unlink className="h-3 w-3" aria-hidden />
                    {t.places.unassignBranch as string}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">
            {(t.places.tabUnassigned as string)} ({filteredUnassigned.length})
          </p>
          {loading ? (
            <SkeletonRows count={4} withThumb={false} label={t.app.loading as string} />
          ) : filteredUnassigned.length === 0 ? (
            <p className="text-[11px] text-muted">{q ? (t.places.searchNoMatch as string) : (t.places.unassignedEmpty as string)}</p>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {filteredUnassigned.map((label) => (
                <li key={label} className="flex items-center justify-between gap-2 rounded border border-border bg-bg-elev/40 px-3 py-2">
                  <span className="text-xs text-muted truncate">{label}</span>
                  <button
                    type="button"
                    onClick={() => link(label)}
                    disabled={busy !== null}
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1 text-[10px] text-muted hover:text-accent sm:min-h-0"
                  >
                    <Link2 className="h-3 w-3" aria-hidden />
                    {t.places.assignBranch as string}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(filteredOthers.length > 0 || (others.length > 0 && q)) && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">
              {(t.places.atOtherPlaces as string)} ({filteredOthers.length})
            </p>
            {filteredOthers.length === 0 ? (
              <p className="text-[11px] text-muted">{t.places.searchNoMatch as string}</p>
            ) : (
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {filteredOthers.map((o) => (
                  <li
                    key={`${o.place_id}:${o.provider_label}`}
                    className="flex items-center justify-between gap-2 rounded border border-border bg-bg-elev/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-muted truncate">{o.provider_label}</p>
                      <p className="text-[10px] text-muted/70 truncate">
                        {(t.places.linkedToPlace as string).replace('{name}', o.place_name)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => moveFromOther(o)}
                      disabled={busy !== null}
                      className="inline-flex min-h-[44px] shrink-0 items-center gap-1 text-[10px] text-muted hover:text-accent sm:min-h-0"
                    >
                      <ArrowRightLeft className="h-3 w-3" aria-hidden />
                      {t.places.moveHere as string}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
