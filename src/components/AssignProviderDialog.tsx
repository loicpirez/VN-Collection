'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, Unlink, Search, ArrowRightLeft } from 'lucide-react';
import { useDialogA11y } from './Dialog';
import { useT } from '@/lib/i18n/client';
import { useConfirm } from './ConfirmDialog';
import { SkeletonRows } from './Skeleton';
import type { PlaceWithLinks } from '@/lib/db';

interface Props {
  place: PlaceWithLinks;
  onClose: () => void;
  onSaved: () => void;
}

interface OtherBranch {
  provider_label: string;
  place_id: number;
  place_name: string;
}

export function AssignProviderDialog({ place, onClose, onSaved }: Props) {
  const t = useT();
  const { confirm } = useConfirm();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialogA11y({ open: true, onClose, panelRef });

  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [linked, setLinked] = useState<string[]>(place.provider_labels);
  const [others, setOthers] = useState<OtherBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [uRes, oRes] = await Promise.all([
        fetch('/api/places/unassigned', { cache: 'no-store' }),
        fetch(`/api/places/${place.id}/other-branches`, { cache: 'no-store' }),
      ]);
      const [uData, oData] = await Promise.all([uRes.json(), oRes.json()]);
      setUnassigned(uData.branches ?? []);
      setOthers(oData.branches ?? []);
    } catch {
      setError(t.common.error as string);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function link(label: string) {
    setBusy(label);
    setError(null);
    try {
      const r = await fetch(`/api/places/${place.id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_label: label }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setLinked((prev) => (prev.includes(label) ? prev : [...prev, label]));
      setUnassigned((prev) => prev.filter((b) => b !== label));
      onSaved();
    } catch {
      setError(t.common.error as string);
    }
    setBusy(null);
  }

  async function unlink(label: string) {
    setBusy(label);
    setError(null);
    try {
      const r = await fetch(`/api/places/${place.id}/link`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_label: label }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setLinked((prev) => prev.filter((b) => b !== label));
      setUnassigned((prev) => [...prev, label].sort((a, b) => a.localeCompare(b)));
      onSaved();
    } catch {
      setError(t.common.error as string);
    }
    setBusy(null);
  }

  async function moveFromOther(branch: OtherBranch) {
    const ok = await confirm({
      message: (t.places.moveConfirm as string)
        .replace('{label}', branch.provider_label)
        .replace('{from}', branch.place_name)
        .replace('{to}', place.name),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(branch.provider_label);
    setError(null);
    try {
      const r = await fetch(`/api/places/${place.id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_label: branch.provider_label, from_place_id: branch.place_id }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setLinked((prev) => (prev.includes(branch.provider_label) ? prev : [...prev, branch.provider_label]));
      setOthers((prev) => prev.filter((b) => !(b.provider_label === branch.provider_label && b.place_id === branch.place_id)));
      onSaved();
    } catch {
      setError(t.common.error as string);
    }
    setBusy(null);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
            className="input w-full pl-8 text-sm"
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
                    disabled={busy === label}
                    className="shrink-0 inline-flex items-center gap-1 text-[10px] text-muted hover:text-red-400"
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
                    disabled={busy === label}
                    className="shrink-0 inline-flex items-center gap-1 text-[10px] text-muted hover:text-accent"
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
                      disabled={busy === o.provider_label}
                      className="shrink-0 inline-flex items-center gap-1 text-[10px] text-muted hover:text-accent"
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
