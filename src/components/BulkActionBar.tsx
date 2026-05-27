'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GitCompare, Heart, Loader2, MapPin, Package, Trash2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { BOX_TYPES, EDITION_TYPES, LOCATIONS, STATUSES, type BoxType, type EditionType, type Location, type Status } from '@/lib/types';
import { StatusIcon } from './StatusIcon';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { CollapsibleSummary } from './CollapsibleSummary';

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

/**
 * Build a localized HTTP-status error message from a status code. Caller
 * is responsible for prefixing with the VN id when surfaced into the
 * per-row error list.
 */
function httpStatusError(httpStatus: string, status: number): string {
  return httpStatus.replace('{status}', String(status));
}

async function patchOne(
  vnId: string,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  httpStatus: string,
): Promise<void> {
  const res = await fetch(`/api/collection/${vnId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `${vnId}: ${httpStatusError(httpStatus, res.status)}`);
  }
}

async function deleteOne(
  vnId: string,
  signal: AbortSignal | undefined,
  httpStatus: string,
): Promise<void> {
  const res = await fetch(`/api/collection/${vnId}`, { method: 'DELETE', signal });
  if (!res.ok) throw new Error(`${vnId}: ${httpStatusError(httpStatus, res.status)}`);
}

export function BulkActionBar({ selectedIds, onClear, onApplied }: Props) {
  const t = useT();
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [operation, setOperation] = useState({ label: '', currentId: '', aborted: false });
  const [errors, setErrors] = useState<string[]>([]);
  const cancelRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const [, startTransition] = useTransition();
  const canCompare = selectedIds.length >= 2 && selectedIds.length <= 4;

  function labelForField(field: BulkField): string {
    switch (field.kind) {
      case 'status':
        return `${t.bulkEdit.setStatus.replace(/\u2026$/, '')}: ${t.status[field.value]}`;
      case 'location':
        return `${t.bulkEdit.setLocation.replace(/\u2026$/, '')}: ${t.locations[field.value]}`;
      case 'edition_type':
        return `${t.bulkEdit.setEdition.replace(/\u2026$/, '')}: ${t.editions[field.value]}`;
      case 'box_type':
        return `${t.bulkEdit.setBox.replace(/\u2026$/, '')}: ${t.boxTypes[field.value]}`;
      case 'favorite':
        return field.value ? t.bulkEdit.markFavorite : t.bulkEdit.unmarkFavorite;
    }
  }

  function requestStop() {
    cancelRef.current = true;
    controllerRef.current?.abort();
    setOperation((prev) => ({ ...prev, aborted: true }));
  }

  async function applyField(field: BulkField) {
    if (selectedIds.length === 0) return;
    cancelRef.current = false;
    setBusy(true);
    setErrors([]);
    setProgress({ done: 0, total: selectedIds.length });
    setOperation({ label: labelForField(field), currentId: '', aborted: false });
    const localErrors: string[] = [];
    let done = 0;
    for (const id of selectedIds) {
      if (cancelRef.current) break;
      const controller = new AbortController();
      controllerRef.current = controller;
      setOperation((prev) => ({ ...prev, currentId: id }));
      try {
        await patchOne(id, { [field.kind]: field.value }, controller.signal, t.common.httpStatus);
      } catch (e) {
        if (!cancelRef.current) localErrors.push((e as Error).message);
      }
      if (controllerRef.current === controller) controllerRef.current = null;
      if (cancelRef.current) break;
      done++;
      setProgress({ done, total: selectedIds.length });
    }
    const aborted = cancelRef.current;
    cancelRef.current = false;
    controllerRef.current = null;
    setBusy(false);
    setOperation((prev) => ({ ...prev, currentId: '', aborted }));
    setErrors(localErrors);
    if (aborted) {
      toast.warning(t.bulk.abortedTitle);
      onApplied();
      return;
    }
    if (localErrors.length === 0) {
      toast.success(t.toast.bulkApplied.replace('{n}', String(selectedIds.length)));
      startTransition(() => {
        onApplied();
        onClear();
      });
    } else {
      toast.error(`${localErrors.length} ${t.bulkEdit.errors}`);
      onApplied();
    }
  }

  async function applyDelete() {
    if (selectedIds.length === 0) return;
    const ok = await confirm({
      message: t.bulkEdit.confirmDelete.replace('{n}', String(selectedIds.length)),
      tone: 'danger',
      requireTyping: selectedIds.length >= 5 ? 'DELETE' : undefined,
    });
    if (!ok) return;
    cancelRef.current = false;
    setBusy(true);
    setErrors([]);
    setProgress({ done: 0, total: selectedIds.length });
    setOperation({ label: t.bulkEdit.deleteAll, currentId: '', aborted: false });
    const localErrors: string[] = [];
    let done = 0;
    for (const id of selectedIds) {
      if (cancelRef.current) break;
      const controller = new AbortController();
      controllerRef.current = controller;
      setOperation((prev) => ({ ...prev, currentId: id }));
      try {
        await deleteOne(id, controller.signal, t.common.httpStatus);
      } catch (e) {
        if (!cancelRef.current) localErrors.push((e as Error).message);
      }
      if (controllerRef.current === controller) controllerRef.current = null;
      if (cancelRef.current) break;
      done++;
      setProgress({ done, total: selectedIds.length });
    }
    const aborted = cancelRef.current;
    cancelRef.current = false;
    controllerRef.current = null;
    setBusy(false);
    setOperation((prev) => ({ ...prev, currentId: '', aborted }));
    setErrors(localErrors);
    if (aborted) {
      toast.warning(t.bulk.abortedTitle);
      onApplied();
      return;
    }
    if (localErrors.length === 0) {
      toast.success(t.toast.bulkDeleted.replace('{n}', String(selectedIds.length)));
    } else {
      toast.error(`${localErrors.length} ${t.bulkEdit.errors}`);
    }
    startTransition(() => {
      onApplied();
      onClear();
    });
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div
      className="fixed bottom-16 left-1/2 z-50 w-[min(96vw,720px)] -translate-x-1/2 rounded-xl border border-border bg-bg-card p-2 shadow-card backdrop-blur sm:bottom-4 sm:p-3"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
          aria-label={t.bulkEdit.markFavorite}
          title={t.bulkEdit.markFavorite}
        >
          <Heart className="h-4 w-4 fill-accent text-accent" aria-hidden />
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => applyField({ kind: 'favorite', value: false })}
          disabled={busy}
          aria-label={t.bulkEdit.unmarkFavorite}
          title={t.bulkEdit.unmarkFavorite}
        >
          <Heart className="h-4 w-4" aria-hidden />
        </button>

        <button
          type="button"
          className="btn"
          onClick={() => router.push(`/compare?ids=${encodeURIComponent(selectedIds.join(','))}`)}
          disabled={busy || !canCompare}
          title={canCompare ? t.bulkEdit.compare : t.bulkEdit.compareHint}
        >
          <GitCompare className="h-4 w-4" /> {t.bulkEdit.compare}
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
        <div className="mt-2" role="status" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            <span className="font-semibold text-text">{operation.label}</span>
            {operation.currentId && <span>{operation.currentId}</span>}
            <span>
              {progress.done}/{progress.total}
            </span>
            <button
              type="button"
              className="ml-auto inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-bg-elev/40 px-3 py-1 text-xs font-semibold text-muted hover:border-accent hover:text-white"
              onClick={requestStop}
            >
              {t.bulk.stop}
            </button>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${operation.label} ${progress.done}/${progress.total}`}
            className="mt-1 h-1 w-full overflow-hidden rounded-full bg-bg-elev"
          >
            <div
              className={`h-full transition-[width] duration-150 ${operation.aborted ? 'bg-status-on_hold' : 'bg-accent'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none text-xs text-status-dropped [&::-webkit-details-marker]:hidden">
            <CollapsibleSummary>
              {errors.length} {t.bulkEdit.errors}
            </CollapsibleSummary>
          </summary>
          <ul className="mt-1 max-h-24 overflow-y-auto text-[10px] text-status-dropped">
            {errors.map((e) => (
              <li key={e} className="truncate">
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
