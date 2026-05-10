'use client';
import { useState, useTransition } from 'react';
import { Heart, Loader2, MapPin, Package, Trash2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { BOX_TYPES, EDITION_TYPES, LOCATIONS, STATUSES, type BoxType, type EditionType, type Location, type Status } from '@/lib/types';
import { StatusIcon } from './StatusIcon';

interface Props {
  selectedIds: string[];
  onClear: () => void;
  onApplied: () => void;
}

type BulkField =
  | { kind: 'status'; value: Status }
  | { kind: 'location'; value: Location }
  | { kind: 'edition_type'; value: EditionType }
  | { kind: 'box_type'; value: BoxType }
  | { kind: 'favorite'; value: boolean };

async function patchOne(vnId: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/collection/${vnId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `${vnId}: HTTP ${res.status}`);
  }
}

async function deleteOne(vnId: string): Promise<void> {
  const res = await fetch(`/api/collection/${vnId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${vnId}: HTTP ${res.status}`);
}

export function BulkActionBar({ selectedIds, onClear, onApplied }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  async function applyField(field: BulkField) {
    if (selectedIds.length === 0) return;
    setBusy(true);
    setErrors([]);
    setProgress({ done: 0, total: selectedIds.length });
    const localErrors: string[] = [];
    let done = 0;
    for (const id of selectedIds) {
      try {
        await patchOne(id, { [field.kind]: field.value });
      } catch (e) {
        localErrors.push((e as Error).message);
      }
      done++;
      setProgress({ done, total: selectedIds.length });
    }
    setBusy(false);
    setErrors(localErrors);
    if (localErrors.length === 0) {
      startTransition(() => {
        onApplied();
        onClear();
      });
    } else {
      onApplied();
    }
  }

  async function applyDelete() {
    if (selectedIds.length === 0) return;
    if (!confirm(t.bulkEdit.confirmDelete.replace('{n}', String(selectedIds.length)))) return;
    setBusy(true);
    setErrors([]);
    setProgress({ done: 0, total: selectedIds.length });
    const localErrors: string[] = [];
    let done = 0;
    for (const id of selectedIds) {
      try {
        await deleteOne(id);
      } catch (e) {
        localErrors.push((e as Error).message);
      }
      done++;
      setProgress({ done, total: selectedIds.length });
    }
    setBusy(false);
    setErrors(localErrors);
    startTransition(() => {
      onApplied();
      onClear();
    });
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="fixed bottom-4 left-1/2 z-30 w-[min(92vw,720px)] -translate-x-1/2 rounded-xl border border-border bg-bg-card p-3 shadow-card backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">
          {selectedIds.length} {t.bulkEdit.selected}
        </span>
        <button type="button" className="btn" onClick={onClear} disabled={busy}>
          <X className="h-4 w-4" /> {t.bulkEdit.cancel}
        </button>

        <Selector<Status>
          icon={<StatusIcon status="planning" className="h-3.5 w-3.5" />}
          label={t.bulkEdit.setStatus}
          options={STATUSES.map((s) => ({ value: s, label: t.status[s] }))}
          onSelect={(v) => applyField({ kind: 'status', value: v })}
          disabled={busy}
        />
        <Selector<Location>
          icon={<MapPin className="h-3.5 w-3.5" />}
          label={t.bulkEdit.setLocation}
          options={LOCATIONS.map((l) => ({ value: l, label: t.locations[l] }))}
          onSelect={(v) => applyField({ kind: 'location', value: v })}
          disabled={busy}
        />
        <Selector<EditionType>
          icon={<Package className="h-3.5 w-3.5" />}
          label={t.bulkEdit.setEdition}
          options={EDITION_TYPES.map((e) => ({ value: e, label: t.editions[e] }))}
          onSelect={(v) => applyField({ kind: 'edition_type', value: v })}
          disabled={busy}
        />
        <Selector<BoxType>
          icon={<Package className="h-3.5 w-3.5" />}
          label={t.bulkEdit.setBox}
          options={BOX_TYPES.map((b) => ({ value: b, label: t.boxTypes[b] }))}
          onSelect={(v) => applyField({ kind: 'box_type', value: v })}
          disabled={busy}
        />

        <button
          type="button"
          className="btn"
          onClick={() => applyField({ kind: 'favorite', value: true })}
          disabled={busy}
          title={t.bulkEdit.markFavorite}
        >
          <Heart className="h-4 w-4 fill-accent text-accent" />
          ★
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => applyField({ kind: 'favorite', value: false })}
          disabled={busy}
          title={t.bulkEdit.unmarkFavorite}
        >
          <Heart className="h-4 w-4" />
          ✕
        </button>

        <button
          type="button"
          className="btn btn-danger"
          onClick={applyDelete}
          disabled={busy}
        >
          <Trash2 className="h-4 w-4" /> {t.bulkEdit.deleteAll}
        </button>
      </div>

      {busy && (
        <div className="mt-2">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            {progress.done}/{progress.total}
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-bg-elev">
            <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-status-dropped">
            {errors.length} {t.bulkEdit.errors}
          </summary>
          <ul className="mt-1 max-h-24 overflow-y-auto text-[10px] text-status-dropped">
            {errors.map((e, i) => (
              <li key={i} className="truncate">
                {e}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface SelectorProps<T extends string> {
  icon: React.ReactNode;
  label: string;
  options: { value: T; label: string }[];
  onSelect: (value: T) => void;
  disabled?: boolean;
}

function Selector<T extends string>({ icon, label, options, onSelect, disabled }: SelectorProps<T>) {
  return (
    <label className="relative inline-flex">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
        {icon}
      </span>
      <select
        className="input w-auto pl-8 pr-3"
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value as T;
          if (v) {
            onSelect(v);
            e.target.value = '';
          }
        }}
        disabled={disabled}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
