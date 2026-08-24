'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, ChevronLeft, ChevronRight, Loader2, Search, Trash2, X } from 'lucide-react';
import type { PhysicalBundle, ShelfEntry } from '@/lib/db';
import { useT } from '@/lib/i18n/client';
import { readApiError } from '@/lib/api-error-read';
import {
  decodePhysicalBundleResponse,
  decodePhysicalBundlesResponse,
} from '@/lib/physical-bundle-client-shape';
import { Dialog } from './Dialog';
import { SafeImage } from './SafeImage';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
import { SkeletonRows } from './Skeleton';

const PAGE_SIZE = 24;

function identity(entry: Pick<ShelfEntry, 'vn_id' | 'release_id'>): string {
  return `${entry.vn_id}\u0000${entry.release_id}`;
}

interface PhysicalBundleDialogProps {
  open: boolean;
  onClose: () => void;
  candidates: ShelfEntry[];
  onChanged: () => void | Promise<void>;
}

/** Create, inspect, and dissolve physical multi-release shelf objects. */
export function PhysicalBundleDialog({ open, onClose, candidates, onChanged }: PhysicalBundleDialogProps) {
  const t = useT();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [bundles, setBundles] = useState<PhysicalBundle[]>([]);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const eligible = useMemo(() => candidates.filter((entry) => entry.bundle_id === null), [candidates]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return eligible;
    return eligible.filter((entry) => (
      entry.vn_title.toLocaleLowerCase().includes(needle) ||
      entry.release_id.toLocaleLowerCase().includes(needle) ||
      entry.edition_label?.toLocaleLowerCase().includes(needle)
    ));
  }, [eligible, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleCandidates = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [query]);

  useEffect(() => {
    if (!open) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const response = await fetch('/api/physical-bundles', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(await readApiError(response, t.shelfLayout.bundleLoadFailed));
        const data = decodePhysicalBundlesResponse(await response.json());
        if (!data) throw new Error(t.shelfLayout.bundleLoadFailed);
        if (!controller.signal.aborted) setBundles(data.bundles);
      } catch (reason) {
        if (!controller.signal.aborted) setError((reason as Error).message || t.shelfLayout.bundleLoadFailed);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [open, t.shelfLayout.bundleLoadFailed]);

  function toggle(entry: ShelfEntry): void {
    const key = identity(entry);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
        if (anchorKey === key) setAnchorKey(next.values().next().value ?? null);
      } else {
        next.add(key);
        if (anchorKey === null) setAnchorKey(key);
      }
      return next;
    });
  }

  async function createBundle(): Promise<void> {
    const members = eligible.filter((entry) => selected.has(identity(entry)));
    const anchor = members.find((entry) => identity(entry) === anchorKey) ?? members[0];
    if (!anchor || members.length < 2 || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/physical-bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          anchor: { vn_id: anchor.vn_id, release_id: anchor.release_id },
          members: members.map((entry) => ({ vn_id: entry.vn_id, release_id: entry.release_id })),
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response, t.shelfLayout.saveFailed));
      const data = decodePhysicalBundleResponse(await response.json());
      if (!data) throw new Error(t.shelfLayout.saveFailed);
      setBundles((current) => [...current, data.bundle].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setSelected(new Set());
      setAnchorKey(null);
      await onChanged();
    } catch (reason) {
      const message = (reason as Error).message || t.shelfLayout.saveFailed;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function dissolve(bundle: PhysicalBundle): Promise<void> {
    const accepted = await confirm({
      message: t.shelfLayout.bundleDissolveConfirm.replace('{name}', bundle.name),
      tone: 'danger',
      confirmLabel: t.shelfLayout.bundleDissolve,
      cancelLabel: t.shelfLayout.cancel,
    });
    if (!accepted) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/physical-bundles/${bundle.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await readApiError(response, t.shelfLayout.saveFailed));
      setBundles((current) => current.filter((entry) => entry.id !== bundle.id));
      await onChanged();
    } catch (reason) {
      const message = (reason as Error).message || t.shelfLayout.saveFailed;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><Box className="h-5 w-5 text-accent" aria-hidden />{t.shelfLayout.bundleManage}</span>}
      description={t.shelfLayout.bundleDescription}
      panelClassName="max-h-[calc(100vh-2rem)] max-w-4xl overflow-y-auto p-4 sm:p-6"
      disableEscape={busy}
      disableBackdropClose={busy}
    >
      <button type="button" onClick={onClose} disabled={busy} className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-bg-elev hover:text-white" aria-label={t.shelfLayout.cancel}>
        <X className="h-4 w-4" aria-hidden />
      </button>

      {error && <p role="alert" className="mb-3 rounded-md border border-status-dropped/40 bg-status-dropped/10 p-2 text-xs text-status-dropped">{error}</p>}

      <section className="border-t border-border pt-4">
        <label className="block text-xs font-bold text-muted" htmlFor="physical-bundle-name">{t.shelfLayout.bundleName}</label>
        <input id="physical-bundle-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder={t.shelfLayout.bundleNamePlaceholder} className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-3 text-sm" />

        <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">{t.shelfLayout.bundleMembers}</h3>
            <p className="text-xs text-muted">{t.shelfLayout.bundleAnchorHint}</p>
          </div>
          <label className="relative block min-w-52">
            <span className="sr-only">{t.search.placeholder}</span>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search.placeholder} className="h-9 w-full rounded-md border border-border bg-bg pl-8 pr-2 text-xs" />
          </label>
        </div>

        <fieldset className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border">
          <legend className="sr-only">{t.shelfLayout.bundleMembers}</legend>
          {visibleCandidates.map((entry) => {
            const key = identity(entry);
            const checked = selected.has(key);
            return (
              <div key={key} className="grid grid-cols-[auto_2.5rem_minmax(0,1fr)_auto] items-center gap-2 bg-bg-elev/20 px-2 py-2">
                <input type="checkbox" checked={checked} onChange={() => toggle(entry)} aria-label={`${t.shelfLayout.bundleMembers}: ${entry.vn_title}`} className="h-4 w-4 accent-accent" />
                <div className="h-12 w-8 overflow-hidden rounded-sm bg-bg">
                  <SafeImage src={entry.rel_image_thumb || entry.vn_image_thumb || entry.vn_image_url} localSrc={entry.rel_local_image_thumb || entry.vn_local_image_thumb} sexual={entry.rel_image_sexual ?? entry.vn_image_sexual} alt="" className="h-full w-full" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{entry.vn_title}</p>
                  <p className="truncate text-[11px] text-muted">{entry.edition_label || entry.rel_title || entry.release_id}</p>
                </div>
                <label className="inline-flex items-center gap-1 text-[11px] text-muted">
                  <input type="radio" name="physical-bundle-anchor" checked={anchorKey === key} disabled={!checked} onChange={() => setAnchorKey(key)} className="h-4 w-4 accent-accent" />
                  {t.shelfLayout.bundleAnchor}
                </label>
              </div>
            );
          })}
          {visibleCandidates.length === 0 && <p className="p-4 text-sm text-muted">{t.shelfLayout.unplacedEmpty}</p>}
        </fieldset>

        {pageCount > 1 && (
          <nav className="mt-2 flex items-center justify-end gap-2" aria-label={t.shelfLayout.bundleMembers}>
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border disabled:opacity-40" aria-label={t.common.back}><ChevronLeft className="h-4 w-4" aria-hidden /></button>
            <span className="text-xs tabular-nums text-muted">{page} / {pageCount}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border disabled:opacity-40" aria-label={t.common.next}><ChevronRight className="h-4 w-4" aria-hidden /></button>
          </nav>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{selected.size < 2 ? t.shelfLayout.bundleRequiresTwo : t.shelfLayout.bundleBadge.replace('{n}', String(selected.size))}</p>
          <button type="button" onClick={() => void createBundle()} disabled={busy || selected.size < 2 || !name.trim()} className="btn btn-primary min-w-36">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Box className="h-4 w-4" aria-hidden />}
            {t.shelfLayout.bundleCreate}
          </button>
        </div>
      </section>

      <section className="mt-6 border-t border-border pt-4">
        <h3 className="mb-2 text-sm font-bold">{t.shelfLayout.bundleExisting}</h3>
        {loading ? (
          <SkeletonRows count={3} withThumb={false} label={t.common.loading} />
        ) : bundles.length === 0 ? (
          <p className="text-sm text-muted">{t.shelfLayout.bundleEmpty}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {bundles.map((bundle) => (
              <li key={bundle.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-bold">{bundle.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{t.shelfLayout.bundleBadge.replace('{n}', String(bundle.members.length))}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted/80">{bundle.members.map((member) => member.vn_title).join(' / ')}</p>
                </div>
                <button type="button" onClick={() => void dissolve(bundle)} disabled={busy} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-status-dropped/40 px-2 text-xs text-status-dropped hover:bg-status-dropped/10 disabled:opacity-40">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />{t.shelfLayout.bundleDissolve}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Dialog>
  );
}
