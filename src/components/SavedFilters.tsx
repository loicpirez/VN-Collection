'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Bookmark, BookmarkPlus, ChevronDown, Filter as FilterIcon, GripVertical, Loader2, Pin, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

import { readApiError } from '@/lib/api-error-read';
import { decodeOrganizerSavedFilters, type OrganizerSavedFilter as Filter } from '@/lib/organizer-client-shape';

/**
 * CustomEvent name dispatched by sibling toolbar components
 * (LibraryActionsMenu) to open this popover without rendering an
 * additional visible trigger. Optional `detail.action === 'save'`
 * also flips the popover into name-input mode so the user lands
 * directly on the save-preset affordance.
 */
export const SAVED_FILTERS_OPEN_EVENT = 'vn:open-saved-filters';

/**
 * Saved filter combos surfaced as a popover behind a single toolbar button -
 * the inline chip row took up a full row at the top of the library, which
 * the user flagged as wasteful. Active filter (when the URL matches one of
 * the saved presets) shows in the button label so it's still discoverable.
 *
 * `triggerHidden`: visually hides the trigger button (still tab-stoppable
 * for keyboard users), so the popover can be opened exclusively via the
 * SAVED_FILTERS_OPEN_EVENT bus from the Library "Options" menu. The
 * popover itself remains visible when open.
 */
export function SavedFilters({ triggerHidden = false }: { triggerHidden?: boolean } = {}) {
  const t = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [filters, setFilters] = useState<Filter[]>([]);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const loadAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const mutationRef = useRef(false);
  const mutationAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      mutationRef.current = false;
      loadAbortRef.current?.abort();
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remote open: any sibling can dispatch
  // `window.dispatchEvent(new CustomEvent('vn:open-saved-filters'))`
  // (with optional `detail: { action: 'save' }`) and we flip open.
  // Used by the Library toolbar's compact Options menu so we have a
  // single canonical SavedFilters surface even though the user spec
  // hides the standalone trigger.
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent).detail as { action?: 'save' } | undefined;
      setOpen(true);
      if (detail?.action === 'save') {
        setDraftName('');
        setNameOpen(true);
      }
    }
    window.addEventListener(SAVED_FILTERS_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SAVED_FILTERS_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      const items = Array.from(ref.current!.querySelectorAll<HTMLElement>('[role="menu"] button:not([disabled])'));
      e.preventDefault();
      const idx = items.indexOf(document.activeElement as HTMLElement);
      let next: HTMLElement | undefined;
      if (e.key === 'Home') next = items[0];
      else if (e.key === 'End') next = items[items.length - 1];
      else if (e.key === 'ArrowDown') next = items[(idx + 1 + items.length) % items.length];
      else next = items[(idx - 1 + items.length) % items.length];
      next?.focus();
    }
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  async function load() {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const { signal } = controller;
    setLoadError(null);
    try {
      const r = await fetch('/api/saved-filters', { cache: 'no-store', signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const data = decodeOrganizerSavedFilters(await r.json());
      if (!data) throw new Error(t.common.error);
      if (signal.aborted || !mountedRef.current || loadAbortRef.current !== controller) return;
      setFilters(data);
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      if (!mountedRef.current || loadAbortRef.current !== controller) return;
      const message = (e as Error).message;
      setLoadError(message);
      toast.error(message);
    } finally {
      if (!signal.aborted && mountedRef.current && loadAbortRef.current === controller) setFiltersLoaded(true);
    }
  }

  function currentParamsKey(): string {
    const ignored = new Set(['page']);
    const entries: [string, string][] = [];
    sp.forEach((v, k) => { if (!ignored.has(k)) entries.push([k, v]); });
    entries.sort(([a], [b]) => a.localeCompare(b));
    return new URLSearchParams(entries).toString();
  }

  async function save() {
    if (mutationRef.current) return;
    const name = draftName.trim();
    if (!name) return;
    const params = currentParamsKey();
    if (!params) {
      toast.error(t.savedFilters.emptyState);
      return;
    }
    mutationRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    setBusy('save');
    try {
      const r = await fetch('/api/saved-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, params }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.toast.saved);
      setNameOpen(false);
      setDraftName('');
      void load();
    } catch (e) {
      if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationRef.current = false;
        setBusy(null);
      }
    }
  }

  async function remove(id: number) {
    if (mutationRef.current) return;
    mutationRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    setBusy(`del-${id}`);
    try {
      const r = await fetch(`/api/saved-filters?id=${id}`, { method: 'DELETE', signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      void load();
    } catch (e) {
      if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationRef.current = false;
        setBusy(null);
      }
    }
  }

  async function reorder(orderedIds: number[], previous: Filter[]) {
    mutationRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    setBusy('reorder');
    try {
      const r = await fetch('/api/saved-filters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: orderedIds }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
    } catch (e) {
      if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setFilters(previous);
      toast.error((e as Error).message);
    } finally {
      if (mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationRef.current = false;
        setBusy(null);
      }
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    if (mutationRef.current) return;
    const { active: from, over } = e;
    if (!over || from.id === over.id) return;
    const oldIdx = filters.findIndex((f) => f.id === from.id);
    const newIdx = filters.findIndex((f) => f.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const previous = filters;
    const next = arrayMove(filters, oldIdx, newIdx);
    setFilters(next);
    void reorder(next.map((f) => f.id), previous);
  }

  const currentKey = currentParamsKey();
  const active = filters.find((f) => f.params === currentKey) ?? null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={popoverId}
        className={
          triggerHidden
            ? 'sr-only'
            : `tap-target inline-flex items-center gap-1.5 rounded-md border bg-bg-elev/40 px-2 py-1 text-[11px] ${
                active ? 'border-accent text-accent' : 'border-border text-muted hover:border-accent hover:text-accent'
              }`
        }
        title={t.savedFilters.title}
      >
        <Bookmark className="h-3 w-3" aria-hidden />
        {active ? active.name : t.savedFilters.title}
        {filters.length > 0 && !active && <span className="text-[10px] opacity-70">/ {filters.length}</span>}
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {open && (
        <div
          id={popoverId}
          role="menu"
          aria-label={t.savedFilters.title}
          className="absolute left-0 top-full z-30 mt-1 w-[min(92vw,18rem)] rounded-lg border border-border bg-bg-card p-2 text-xs shadow-card"
        >
          {loadError ? (
            <p role="alert" className="mb-2 rounded-md border border-status-dropped/40 bg-status-dropped/10 px-2 py-1.5 text-status-dropped">
              {loadError}
            </p>
          ) : !filtersLoaded ? (
            <div className="flex min-h-[120px] items-center px-2 py-1.5">
              <p className="inline-flex items-center gap-1.5 text-muted">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {t.common.loading}
              </p>
            </div>
          ) : filters.length === 0 ? (
            <div className="space-y-2 px-1 py-1">
              <p className="text-muted">{t.savedFilters.popoverEmpty}</p>
              {!currentKey && (
                <p className="text-[10px] text-muted/70">
                  {t.savedFilters.openDrawerHint}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(
                    new CustomEvent('vn:open-advanced-filters'),
                  );
                }}
                disabled={busy != null}
                className="flex min-h-[44px] w-full items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2 py-1.5 text-accent hover:bg-accent/20 sm:min-h-0"
              >
                <FilterIcon className="h-3 w-3" aria-hidden />
                {t.savedFilters.openDrawerCta}
              </button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={filters.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <ul className="mb-2 max-h-[min(50vh,16rem)] space-y-0.5 overflow-y-auto">
                  {filters.map((f) => (
                    <PresetRow
                      key={f.id}
                      filter={f}
                      isActive={f.params === currentKey}
                      busy={busy}
                      dragHandleLabel={t.savedFilters.reorderHandle}
                      deleteLabel={t.common.delete}
                      onNavigate={() => {
                        router.push(`/?${f.params}`);
                        setOpen(false);
                      }}
                      onDelete={() => remove(f.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
          {!nameOpen ? (
            <button
              type="button"
              onClick={() => { setDraftName(''); setNameOpen(true); }}
              disabled={!currentKey || busy != null}
              className="flex min-h-[44px] w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-muted hover:border-accent hover:text-accent disabled:opacity-40 sm:min-h-0"
              title={currentKey ? t.savedFilters.saveCurrent : t.savedFilters.emptyState}
            >
              <BookmarkPlus className="h-3 w-3" aria-hidden />
              {t.savedFilters.saveCta}
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setNameOpen(false); }}
                placeholder={t.savedFilters.namePlaceholder}
                aria-label={t.savedFilters.namePlaceholder}
                disabled={busy != null}
                className="input w-full py-1 text-xs"
                maxLength={60}
              />
              <button type="button" onClick={save} disabled={busy != null} className="btn btn-primary btn-xs min-h-[44px] sm:min-h-0">
                {busy === 'save' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : t.common.save}
              </button>
              <button type="button" onClick={() => setNameOpen(false)} disabled={busy != null} className="btn btn-xs min-h-[44px] sm:min-h-0" aria-label={t.common.cancel}>
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PresetRow({
  filter,
  isActive,
  busy,
  dragHandleLabel,
  deleteLabel,
  onNavigate,
  onDelete,
}: {
  filter: Filter;
  isActive: boolean;
  busy: string | null;
  dragHandleLabel: string;
  deleteLabel: string;
  onNavigate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: filter.id,
    disabled: busy != null,
    transition: { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 rounded-md ${isDragging ? 'bg-bg-elev shadow-card' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={dragHandleLabel}
        title={dragHandleLabel}
        disabled={busy != null}
        className="inline-flex h-11 w-7 shrink-0 cursor-grab items-center justify-center rounded text-muted hover:text-white active:cursor-grabbing sm:h-8"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onNavigate}
        className={`flex min-h-[44px] flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-bg-elev sm:min-h-0 ${
          isActive ? 'text-accent' : 'text-white/85'
        }`}
        title={filter.name}
      >
        <Pin className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{filter.name}</span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy != null}
        aria-label={deleteLabel}
        className="tap-target-tight rounded text-muted hover:text-status-dropped"
      >
        {busy === `del-${filter.id}` ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
      </button>
    </li>
  );
}
