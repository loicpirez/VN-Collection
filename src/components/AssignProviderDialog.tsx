'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, Unlink } from 'lucide-react';
import { useDialogA11y } from './Dialog';
import { useT } from '@/lib/i18n/client';
import type { PlaceWithLinks } from '@/lib/db';

interface Props {
  place: PlaceWithLinks;
  onClose: () => void;
  onSaved: () => void;
}

export function AssignProviderDialog({ place, onClose, onSaved }: Props) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialogA11y({ open: true, onClose, panelRef });

  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [linked, setLinked] = useState<string[]>(place.provider_labels);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/places/unassigned')
      .then((r) => r.json())
      .then((d) => setUnassigned(d.branches ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function link(label: string) {
    setBusy(label);
    await fetch(`/api/places/${place.id}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_label: label }),
    });
    setLinked((prev) => [...prev, label]);
    setUnassigned((prev) => prev.filter((b) => b !== label));
    setBusy(null);
    onSaved();
  }

  async function unlink(label: string) {
    setBusy(label);
    await fetch(`/api/places/${place.id}/link`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_label: label }),
    });
    setLinked((prev) => prev.filter((b) => b !== label));
    setUnassigned((prev) => [...prev, label].sort((a, b) => a.localeCompare(b)));
    setBusy(null);
    onSaved();
  }

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
        <p className="text-[11px] text-muted mb-4">{place.name}</p>
        <p className="text-[11px] text-muted mb-3">{t.places.assignDialogHint as string}</p>

        {linked.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-accent mb-2">{t.places.tabLinked as string}</p>
            <ul className="space-y-1">
              {linked.map((label) => (
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

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">{t.places.tabUnassigned as string}</p>
          {loading ? (
            <p className="text-[11px] text-muted">{t.app.loading as string}</p>
          ) : unassigned.length === 0 ? (
            <p className="text-[11px] text-muted">{t.places.unassignedEmpty as string}</p>
          ) : (
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {unassigned.map((label) => (
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
      </div>
    </div>,
    document.body,
  );
}
