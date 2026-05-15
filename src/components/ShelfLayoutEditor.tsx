'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  ArrowDown,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  GripVertical,
  Layers,
  LayoutGrid,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { SafeImage } from '@/components/SafeImage';
import { useConfirm } from '@/components/ConfirmDialog';
import { useToast } from '@/components/ToastProvider';
import { SkeletonBlock } from '@/components/Skeleton';
import type { ShelfEntry, ShelfSlotEntry, ShelfUnitWithCount } from '@/lib/db';
import { parseDragId, parseCellId, type DragSource } from '@/lib/drag-id';

interface Props {
  initialShelves: ShelfUnitWithCount[];
  initialUnplaced: ShelfEntry[];
}

interface LoadedShelfState {
  shelf: ShelfUnitWithCount;
  slots: ShelfSlotEntry[];
}

const POOL_DROPPABLE_ID = '__pool__';
const SHELF_MIN = 1;
// Matches the server-side sanity cap. Effectively unlimited for real
// shelves — you'd run out of editions long before hitting it.
const SHELF_MAX = 200;

function clampDim(n: number): number {
  if (!Number.isFinite(n)) return SHELF_MIN;
  return Math.max(SHELF_MIN, Math.min(SHELF_MAX, Math.floor(n)));
}

/**
 * Two-pane drag-and-drop editor for the physical shelf layout.
 *
 * Top: shelf selector tabs + management toolbar (new / rename / resize
 * / delete). Main area: the active shelf rendered as a CSS grid of
 * (cols × rows) droppable cells. Side / bottom: the "Unplaced" pool of
 * owned editions that aren't on any shelf yet.
 *
 * DnD model:
 *   • Pool tile  → empty cell  : place
 *   • Pool tile  → occupied    : occupant evicted to pool
 *   • Slot tile  → empty cell  : move
 *   • Slot tile  → occupied    : atomic swap (server-side via placeShelfItem)
 *   • Slot tile  → pool        : remove placement
 *
 * Every action is optimistic. On failure we restore the prior state
 * and toast — no half-updated rendering.
 */
export function ShelfLayoutEditor({ initialShelves, initialUnplaced }: Props) {
  const t = useT();
  const toast = useToast();
  const { confirm, prompt } = useConfirm();

  const [shelves, setShelves] = useState<ShelfUnitWithCount[]>(initialShelves);
  const [activeId, setActiveId] = useState<number | null>(
    initialShelves[0]?.id ?? null,
  );
  const [loaded, setLoaded] = useState<Record<number, LoadedShelfState>>({});
  const [unplaced, setUnplaced] = useState<ShelfEntry[]>(initialUnplaced);
  const [draggingFrom, setDraggingFrom] = useState<DragSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(initialShelves.length === 0);
  const [newName, setNewName] = useState('');
  const createInputRef = useRef<HTMLInputElement | null>(null);

  // Load the active shelf's slots on first selection. Subsequent
  // selections re-use the cached entry until a mutation invalidates it.
  useEffect(() => {
    if (activeId == null) return;
    if (loaded[activeId]) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shelves/${activeId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { shelf: ShelfUnitWithCount; slots: ShelfSlotEntry[] };
        if (cancelled) return;
        setLoaded((prev) => ({ ...prev, [activeId]: { shelf: data.shelf, slots: data.slots } }));
      } catch (e) {
        if (!cancelled) toast.error((e as Error).message || t.shelfLayout.saveFailed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, loaded, toast, t.shelfLayout.saveFailed]);

  useEffect(() => {
    if (showCreate) {
      const id = window.setTimeout(() => createInputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [showCreate]);

  const activeShelf = activeId != null ? shelves.find((s) => s.id === activeId) ?? null : null;
  const activeState = activeId != null ? loaded[activeId] ?? null : null;
  const activeIndex = activeId != null ? shelves.findIndex((s) => s.id === activeId) : -1;

  // Pokémon-box style left/right paging across shelves. Wraps around
  // the ends so you can swipe forever. Disabled while a text input or
  // textarea has focus so paging doesn't fight typing.
  const pageShelf = useCallback(
    (delta: -1 | 1) => {
      if (shelves.length === 0) return;
      const idx = activeIndex < 0 ? 0 : activeIndex;
      const next = (idx + delta + shelves.length) % shelves.length;
      setActiveId(shelves[next].id);
    },
    [shelves, activeIndex],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        pageShelf(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        pageShelf(1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageShelf]);

  // PointerSensor with 6 px activation lets a tap-through act as a
  // click on the underlying SafeImage; KeyboardSensor + TouchSensor
  // give us mobile + a11y for free.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function patchActiveSlots(updater: (prev: ShelfSlotEntry[]) => ShelfSlotEntry[]) {
    if (activeId == null) return;
    setLoaded((prev) => {
      const cur = prev[activeId];
      if (!cur) return prev;
      return { ...prev, [activeId]: { ...cur, slots: updater(cur.slots) } };
    });
  }

  async function placeOnSlot(target: { row: number; col: number }, source: DragSource) {
    if (activeId == null) return;
    // Optimistic update:
    //   • move/insert the dragged item to (row, col)
    //   • if source was a slot AND target had an occupant → put occupant at source slot (swap)
    //   • if source was the pool AND target had an occupant → push occupant to the pool
    const prevSnapshot: { slots: ShelfSlotEntry[]; pool: ShelfEntry[] } = {
      slots: activeState?.slots ?? [],
      pool: unplaced,
    };

    setBusy(true);
    try {
      // Build a hopeful next state from a fresh fetch result. To keep
      // the UI snappy we still patch locally first, then reconcile
      // with the server response.
      patchActiveSlots((prev) => {
        const next = prev.filter(
          (s) => !(s.row === target.row && s.col === target.col)
            && !(s.vn_id === source.vn_id && s.release_id === source.release_id),
        );
        const ed = findEdition(source, prevSnapshot.slots, prevSnapshot.pool);
        if (!ed) return prev;
        next.push({
          shelf_id: activeId,
          row: target.row,
          col: target.col,
          vn_id: source.vn_id,
          release_id: source.release_id,
          vn_title: ed.vn_title,
          vn_image_thumb: ed.vn_image_thumb,
          vn_image_url: ed.vn_image_url,
          vn_local_image_thumb: ed.vn_local_image_thumb,
          vn_image_sexual: ed.vn_image_sexual,
          edition_label: ed.edition_label,
          box_type: ed.box_type,
          condition: ed.condition,
          dumped: ed.dumped,
        });
        return next;
      });

      const occupant = prevSnapshot.slots.find(
        (s) => s.row === target.row && s.col === target.col,
      );
      if (occupant && source.kind === 'pool') {
        setUnplaced((prev) => [
          ...prev,
          shelfSlotToShelfEntry(occupant),
        ]);
      }
      if (source.kind === 'pool') {
        setUnplaced((prev) =>
          prev.filter(
            (e) => !(e.vn_id === source.vn_id && e.release_id === source.release_id),
          ),
        );
      }

      const res = await fetch(`/api/shelves/${activeId}/slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row: target.row,
          col: target.col,
          vn_id: source.vn_id,
          release_id: source.release_id,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { slots: ShelfSlotEntry[]; swapped: unknown };
      // Reconcile with authoritative server slots; refresh pool too.
      setLoaded((prev) => {
        const cur = prev[activeId];
        if (!cur) return prev;
        return { ...prev, [activeId]: { ...cur, slots: data.slots } };
      });
      await refreshPool();
      await refreshShelfMeta();
    } catch (e) {
      patchActiveSlots(() => prevSnapshot.slots);
      setUnplaced(prevSnapshot.pool);
      toast.error((e as Error).message || t.shelfLayout.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function unplaceItem(source: DragSource) {
    if (activeId == null) return;
    const prevSnapshot: { slots: ShelfSlotEntry[]; pool: ShelfEntry[] } = {
      slots: activeState?.slots ?? [],
      pool: unplaced,
    };
    setBusy(true);
    try {
      const occupant = prevSnapshot.slots.find(
        (s) => s.vn_id === source.vn_id && s.release_id === source.release_id,
      );
      if (occupant) {
        patchActiveSlots((prev) =>
          prev.filter(
            (s) => !(s.vn_id === source.vn_id && s.release_id === source.release_id),
          ),
        );
        setUnplaced((prev) => [...prev, shelfSlotToShelfEntry(occupant)]);
      }
      const res = await fetch(`/api/shelves/${activeId}/slots`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vn_id: source.vn_id, release_id: source.release_id }),
      });
      if (!res.ok) throw new Error(await res.text());
      await refreshPool();
      await refreshShelfMeta();
    } catch (e) {
      patchActiveSlots(() => prevSnapshot.slots);
      setUnplaced(prevSnapshot.pool);
      toast.error((e as Error).message || t.shelfLayout.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function refreshPool() {
    try {
      const res = await fetch('/api/shelves?pool=1', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { unplaced?: ShelfEntry[] };
      if (data.unplaced) setUnplaced(data.unplaced);
    } catch {
      // Pool refresh is non-essential; soft-fail to keep optimistic state.
    }
  }

  async function refreshShelfMeta() {
    try {
      const res = await fetch('/api/shelves', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { shelves: ShelfUnitWithCount[] };
      setShelves(data.shelves);
    } catch {
      // Non-essential.
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    setDraggingFrom(null);
    const { active, over } = e;
    if (!over) return;
    const source = parseDragId(String(active.id));
    if (!source) return;
    const overId = String(over.id);
    if (overId === POOL_DROPPABLE_ID) {
      if (source.kind === 'slot') await unplaceItem(source);
      return;
    }
    const cell = parseCellId(overId);
    if (!cell) return;
    // No-op when dropping onto the source cell.
    if (
      source.kind === 'slot' &&
      cell.shelf_id === source.shelf_id &&
      cell.row === source.row &&
      cell.col === source.col
    ) {
      return;
    }
    await placeOnSlot({ row: cell.row, col: cell.col }, source);
  }

  function onDragStart(e: DragStartEvent) {
    setDraggingFrom(parseDragId(String(e.active.id)));
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch('/api/shelves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { shelf: ShelfUnitWithCount };
      setShelves((prev) => [...prev, { ...data.shelf, placed_count: 0 }]);
      setActiveId(data.shelf.id);
      setNewName('');
      setShowCreate(false);
    } catch (e) {
      toast.error((e as Error).message || t.shelfLayout.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function handleRename() {
    if (!activeShelf) return;
    const next = await prompt({
      title: t.shelfLayout.rename,
      initial: activeShelf.name,
      confirmLabel: t.shelfLayout.rename,
      cancelLabel: t.shelfLayout.cancel,
    });
    if (!next) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shelves/${activeShelf.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      setShelves((prev) =>
        prev.map((s) => (s.id === activeShelf.id ? { ...s, name: next } : s)),
      );
      setLoaded((prev) => {
        const cur = prev[activeShelf.id];
        if (!cur) return prev;
        return {
          ...prev,
          [activeShelf.id]: { ...cur, shelf: { ...cur.shelf, name: next } },
        };
      });
    } catch (e) {
      toast.error((e as Error).message || t.shelfLayout.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function handleResize(deltaCols: number, deltaRows: number) {
    if (!activeShelf) return;
    const cols = clampDim(activeShelf.cols + deltaCols);
    const rows = clampDim(activeShelf.rows + deltaRows);
    if (cols === activeShelf.cols && rows === activeShelf.rows) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shelves/${activeShelf.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols, rows }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        shelf: ShelfUnitWithCount;
        slots: ShelfSlotEntry[];
        evicted: Array<{ vn_id: string; release_id: string }>;
      };
      setShelves((prev) =>
        prev.map((s) => (s.id === activeShelf.id ? { ...s, ...data.shelf } : s)),
      );
      setLoaded((prev) => ({
        ...prev,
        [activeShelf.id]: { shelf: { ...activeShelf, ...data.shelf }, slots: data.slots },
      }));
      if (data.evicted.length > 0) {
        toast.warning(
          t.shelfLayout.evictedHint.replace('{n}', String(data.evicted.length)),
        );
        // Pool must reload to surface evicted editions.
        const poolRes = await fetch('/api/shelves?pool=1', { cache: 'no-store' });
        if (poolRes.ok) {
          const poolData = (await poolRes.json()) as { unplaced?: ShelfEntry[] };
          if (poolData.unplaced) setUnplaced(poolData.unplaced);
        }
      }
    } catch (e) {
      toast.error((e as Error).message || t.shelfLayout.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!activeShelf) return;
    const ok = await confirm({
      message: t.shelfLayout.deleteConfirm,
      tone: 'danger',
      confirmLabel: t.shelfLayout.delete,
      cancelLabel: t.shelfLayout.cancel,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shelves/${activeShelf.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      setShelves((prev) => prev.filter((s) => s.id !== activeShelf.id));
      setLoaded((prev) => {
        const next = { ...prev };
        delete next[activeShelf.id];
        return next;
      });
      // Cascade-delete on shelf_slot returned items to the pool — fetch fresh.
      const poolRes = await fetch('/api/shelves?pool=1', { cache: 'no-store' });
      if (poolRes.ok) {
        const poolData = (await poolRes.json()) as { unplaced?: ShelfEntry[] };
        if (poolData.unplaced) setUnplaced(poolData.unplaced);
      }
      setActiveId(shelves.find((s) => s.id !== activeShelf.id)?.id ?? null);
    } catch (e) {
      toast.error((e as Error).message || t.shelfLayout.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  const placedItems = activeState?.slots ?? [];
  const grid = useMemo(() => {
    if (!activeShelf) return null;
    const map = new Map<string, ShelfSlotEntry>();
    placedItems.forEach((s) => map.set(`${s.row}:${s.col}`, s));
    return map;
  }, [activeShelf, placedItems]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingFrom(null)}
    >
      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        {/* Shelf tabs + toolbar — left/right paginators flank the tab
            strip so the user can swipe between shelves like a Pokémon
            box. Keyboard ←/→ does the same thing. */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => pageShelf(-1)}
              disabled={shelves.length < 2}
              aria-label={t.shelfLayout.prevShelf}
              title={t.shelfLayout.prevShelf}
              className="tap-target inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <div
              role="tablist"
              aria-label={t.shelfLayout.pickShelf}
              className="flex flex-wrap items-center gap-2"
            >
              {shelves.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  id={`shelf-tab-${s.id}`}
                  aria-controls={`shelf-panel-${s.id}`}
                  aria-selected={s.id === activeId}
                  tabIndex={s.id === activeId ? 0 : -1}
                  onClick={() => setActiveId(s.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${
                    s.id === activeId
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border bg-bg-elev/40 text-muted hover:border-accent/60 hover:text-white'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> {s.name}
                  <span className="rounded bg-bg-elev/60 px-1 text-[10px] font-normal text-muted/80">
                    {s.placed_count} / {s.cols * s.rows}
                  </span>
                  {s.id === activeId && (
                    <span className="rounded bg-accent/20 px-1 text-[10px] font-bold tabular-nums text-accent">
                      {i + 1}/{shelves.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => pageShelf(1)}
              disabled={shelves.length < 2}
              aria-label={t.shelfLayout.nextShelf}
              title={t.shelfLayout.nextShelf}
              className="tap-target inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border bg-bg-elev/30 px-2.5 py-1 text-xs font-bold text-muted hover:border-accent hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> {t.shelfLayout.newShelf}
            </button>
          </div>
          {activeShelf && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 rounded border border-border bg-bg-elev/40 px-2 py-1 text-muted">
                <Maximize2 className="h-3 w-3" aria-hidden /> {activeShelf.cols} × {activeShelf.rows}
              </span>
              <ResizeButton
                label={t.shelfLayout.cols}
                ariaInc={t.shelfLayout.incrementCols}
                ariaDec={t.shelfLayout.decrementCols}
                value={activeShelf.cols}
                onChange={(d) => handleResize(d, 0)}
                disabled={busy}
              />
              <ResizeButton
                label={t.shelfLayout.rows}
                ariaInc={t.shelfLayout.incrementRows}
                ariaDec={t.shelfLayout.decrementRows}
                value={activeShelf.rows}
                onChange={(d) => handleResize(0, d)}
                disabled={busy}
              />
              <button
                type="button"
                onClick={handleRename}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded border border-border bg-bg-elev/40 px-2 py-1 text-muted hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <Edit3 className="h-3 w-3" aria-hidden /> {t.shelfLayout.rename}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded border border-status-dropped/40 bg-status-dropped/10 px-2 py-1 text-status-dropped hover:border-status-dropped disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" aria-hidden /> {t.shelfLayout.delete}
              </button>
            </div>
          )}
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-accent/50 bg-accent/5 p-3">
            <input
              ref={createInputRef}
              type="text"
              placeholder={t.shelfLayout.newShelfName}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') {
                  setShowCreate(false);
                  setNewName('');
                }
              }}
              className="flex-1 rounded border border-border bg-bg px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy || newName.trim().length === 0}
              className="btn"
            >
              <Check className="h-4 w-4" aria-hidden /> {t.shelfLayout.create}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setNewName('');
              }}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:text-white"
            >
              <X className="h-3 w-3" /> {t.shelfLayout.cancel}
            </button>
          </div>
        )}

        {busy && (
          <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] text-muted">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {t.shelfLayout.saving}
          </p>
        )}

        {/* Grid */}
        {!activeShelf ? (
          shelves.length === 0 ? (
            <p className="rounded-lg border border-border bg-bg-elev/30 p-4 text-sm text-muted">
              {t.shelfLayout.noShelves}
            </p>
          ) : (
            <SkeletonBlock className="h-48 w-full" />
          )
        ) : !activeState ? (
          <ShelfGridSkeleton rows={activeShelf.rows} cols={activeShelf.cols} />
        ) : (
          <ShelfGrid
            shelf={activeShelf}
            occupied={grid!}
            draggingFrom={draggingFrom}
          />
        )}

        <p className="mt-3 text-[11px] text-muted/80 sm:hidden">{t.shelfLayout.mobileHint}</p>
        <Legend
          used={activeShelf ? activeShelf.placed_count : undefined}
          total={activeShelf ? activeShelf.cols * activeShelf.rows : undefined}
        />
      </section>

      <section className="mt-5 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h3 className="mb-1 flex items-center gap-2 text-base font-bold">
          <Layers className="h-4 w-4 text-accent" aria-hidden /> {t.shelfLayout.unplaced}
          <span className="rounded bg-bg-elev/60 px-1.5 py-0.5 text-[10px] text-muted">
            {unplaced.length}
          </span>
        </h3>
        <p className="mb-3 text-xs text-muted">{t.shelfLayout.unplacedHint}</p>
        <PoolDrop>
          {unplaced.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-bg-elev/30 p-4 text-sm text-muted">
              {t.shelfLayout.unplacedEmpty}
            </p>
          ) : (
            <ul
              className="grid gap-2"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
            >
              {unplaced.map((e) => (
                <DraggablePoolItem key={`${e.vn_id}:${e.release_id}`} entry={e} />
              ))}
            </ul>
          )}
        </PoolDrop>
      </section>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {draggingFrom ? (
          <DragGhost
            from={draggingFrom}
            slots={activeState?.slots ?? []}
            pool={unplaced}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function ShelfGrid({
  shelf,
  occupied,
  draggingFrom,
}: {
  shelf: ShelfUnitWithCount;
  occupied: Map<string, ShelfSlotEntry>;
  draggingFrom: DragSource | null;
}) {
  const cells: Array<{ row: number; col: number; slot: ShelfSlotEntry | undefined }> = [];
  for (let r = 0; r < shelf.rows; r += 1) {
    for (let c = 0; c < shelf.cols; c += 1) {
      cells.push({ row: r, col: c, slot: occupied.get(`${r}:${c}`) });
    }
  }
  // Cell dimensions hand-tuned to balance "thumbnail visible" with
  // "shelf fits on a phone". 64px works at any breakpoint;
  // overflow-x-auto guarantees wide shelves never break the layout.
  return (
    <div
      className="scroll-fade-right overflow-x-auto rounded-lg border border-border bg-bg-elev/20 p-2"
      role="tabpanel"
      id={`shelf-panel-${shelf.id}`}
      aria-labelledby={`shelf-tab-${shelf.id}`}
      tabIndex={0}
    >
      <div
        className="inline-grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${shelf.cols}, minmax(64px, 1fr))`,
        }}
        role="grid"
        aria-label={shelf.name}
      >
        {cells.map(({ row, col, slot }) => (
          <DroppableCell
            key={`${row}:${col}`}
            shelf={shelf}
            row={row}
            col={col}
            slot={slot}
            draggingFrom={draggingFrom}
          />
        ))}
      </div>
    </div>
  );
}

function ShelfGridSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev/20 p-2">
      <div
        className="inline-grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(64px, 1fr))` }}
      >
        {Array.from({ length: rows * cols }).map((_, i) => (
          <SkeletonBlock key={i} className="aspect-[2/3] w-full" />
        ))}
      </div>
    </div>
  );
}

function DroppableCell({
  shelf,
  row,
  col,
  slot,
  draggingFrom,
}: {
  shelf: ShelfUnitWithCount;
  row: number;
  col: number;
  slot: ShelfSlotEntry | undefined;
  draggingFrom: DragSource | null;
}) {
  const id = `cell|${shelf.id}|${row}|${col}`;
  const { isOver, setNodeRef } = useDroppable({ id });
  const isSource =
    draggingFrom?.kind === 'slot' &&
    draggingFrom.shelf_id === shelf.id &&
    draggingFrom.row === row &&
    draggingFrom.col === col;
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-rowindex={row + 1}
      aria-colindex={col + 1}
      className={`relative aspect-[2/3] w-full overflow-hidden rounded-md border transition-colors ${
        slot
          ? 'border-border bg-bg-elev/40'
          : 'border-dashed border-border/70 bg-bg-elev/15'
      } ${isOver ? 'ring-2 ring-accent ring-offset-1 ring-offset-bg-card' : ''} ${
        isSource ? 'opacity-40' : ''
      }`}
    >
      {slot ? (
        <DraggableSlotItem slot={slot} />
      ) : (
        <span className="pointer-events-none absolute left-1 top-1 text-[9px] font-bold uppercase tracking-wider text-muted/40">
          {`${row + 1}·${col + 1}`}
        </span>
      )}
    </div>
  );
}

function DraggablePoolItem({ entry }: { entry: ShelfEntry }) {
  // Pipe-delimited because synthetic release ids contain a colon
  // (`synthetic:vN`). Splitting on `:` would mis-parse them.
  const id = `pool|${entry.vn_id}|${entry.release_id}`;
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`group/poolitem relative flex cursor-grab touch-none select-none flex-col gap-1 overflow-hidden rounded-md border border-border bg-bg-elev/40 p-1.5 transition-colors hover:border-accent active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="aspect-[2/3] w-full overflow-hidden rounded">
        <SafeImage
          src={entry.vn_image_url || entry.vn_image_thumb}
          localSrc={entry.vn_local_image_thumb}
          sexual={entry.vn_image_sexual}
          alt={entry.vn_title}
          className="h-full w-full"
        />
      </div>
      <p className="line-clamp-2 text-[10px] font-bold leading-tight">{entry.vn_title}</p>
      {entry.edition_label && (
        <p className="line-clamp-1 text-[10px] text-muted/80">{entry.edition_label}</p>
      )}
      <span className="absolute right-1 top-1 rounded bg-bg/70 p-0.5 text-muted opacity-0 transition-opacity group-hover/poolitem:opacity-100">
        <GripVertical className="h-3 w-3" aria-hidden />
      </span>
    </li>
  );
}

function DraggableSlotItem({ slot }: { slot: ShelfSlotEntry }) {
  const t = useT();
  // Pipe-delimited so synthetic release ids (`synthetic:vN`) survive
  // round-trip through parseDragId.
  const id = `slot|${slot.vn_id}|${slot.release_id}|${slot.shelf_id}|${slot.row}|${slot.col}`;
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      title={`${slot.vn_title} — ${t.shelfLayout.placedAt
        .replace('{row}', String(slot.row + 1))
        .replace('{col}', String(slot.col + 1))}`}
      className={`group/slot relative h-full w-full cursor-grab touch-none select-none active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      <SafeImage
        src={slot.vn_image_url || slot.vn_image_thumb}
        localSrc={slot.vn_local_image_thumb}
        sexual={slot.vn_image_sexual}
        alt={slot.vn_title}
        className="h-full w-full"
      />
      {slot.box_type !== 'none' && (
        <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-bg/75 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted">
          <Box className="h-2.5 w-2.5" aria-hidden />
          {(t.boxTypes as Record<string, string>)[slot.box_type] ?? slot.box_type}
        </span>
      )}
      {slot.dumped && (
        <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded bg-status-completed/85 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-bg">
          <ArrowDown className="h-2.5 w-2.5" aria-hidden />
        </span>
      )}
      <Link
        href={`/vn/${slot.vn_id}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute bottom-0 left-0 right-0 line-clamp-1 bg-bg/85 px-1 py-0.5 text-[9px] font-bold leading-tight text-white opacity-100 transition-opacity hover:text-accent sm:opacity-0 sm:group-hover/slot:opacity-100"
      >
        {slot.vn_title}
      </Link>
    </div>
  );
}

function PoolDrop({ children }: { children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: POOL_DROPPABLE_ID });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[80px] rounded-lg border-2 border-dashed p-2 transition-colors ${
        isOver ? 'border-accent bg-accent/5' : 'border-transparent'
      }`}
    >
      {children}
    </div>
  );
}

function DragGhost({
  from,
  slots,
  pool,
}: {
  from: DragSource;
  slots: ShelfSlotEntry[];
  pool: ShelfEntry[];
}) {
  const ed = findEdition(from, slots, pool);
  if (!ed) return null;
  return (
    <div className="rotate-[3deg] cursor-grabbing">
      <div className="h-24 w-16 overflow-hidden rounded-md shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] ring-2 ring-accent">
        <SafeImage
          src={ed.vn_image_url || ed.vn_image_thumb}
          localSrc={ed.vn_local_image_thumb}
          sexual={ed.vn_image_sexual}
          alt={ed.vn_title}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}

function ResizeButton({
  label,
  ariaInc,
  ariaDec,
  value,
  onChange,
  disabled,
}: {
  label: string;
  ariaInc: string;
  ariaDec: string;
  value: number;
  onChange: (delta: number) => void;
  disabled: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-border bg-bg-elev/40 px-1 py-0.5 text-muted">
      <span className="px-1 text-[10px] font-bold uppercase tracking-wider">{label}</span>
      <button
        type="button"
        onClick={() => onChange(-1)}
        disabled={disabled || value <= SHELF_MIN}
        aria-label={ariaDec}
        title={ariaDec}
        className="tap-target-tight rounded p-0.5 hover:bg-bg-elev hover:text-white disabled:opacity-30"
      >
        <Minus className="h-3 w-3" aria-hidden />
      </button>
      <span className="min-w-[18px] text-center text-[11px] tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={disabled || value >= SHELF_MAX}
        aria-label={ariaInc}
        title={ariaInc}
        className="tap-target-tight rounded p-0.5 hover:bg-bg-elev hover:text-white disabled:opacity-30"
      >
        <Plus className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

function Legend({ used, total }: { used?: number; total?: number }) {
  const t = useT();
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[10px] uppercase tracking-wider text-muted/60">
        <span>{t.shelfLayout.legend}</span>
        {typeof used === 'number' && typeof total === 'number' && (
          <span className="normal-case tracking-normal">
            {t.shelfLayout.capacityHint
              .replace('{used}', String(used))
              .replace('{total}', String(total))}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted/70">
        <span className="inline-flex items-center gap-1">
          <span className="block h-3 w-3 rounded border border-border bg-bg-elev/40" />{' '}
          {t.shelfLayout.legendOccupied}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="block h-3 w-3 rounded border border-dashed border-border bg-bg-elev/15" />{' '}
          {t.shelfLayout.legendEmpty}
        </span>
        <span className="inline-flex items-center gap-1 text-status-completed">
          <ArrowDown className="h-3 w-3" aria-hidden /> {t.shelfLayout.legendDumped}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-muted/60">
          <Undo2 className="h-3 w-3" aria-hidden /> {t.shelfLayout.removeFromShelf}
        </span>
      </div>
    </div>
  );
}


function findEdition(
  src: DragSource,
  slots: ShelfSlotEntry[],
  pool: ShelfEntry[],
): {
  vn_title: string;
  vn_image_thumb: string | null;
  vn_image_url: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
  edition_label: string | null;
  box_type: string;
  condition: string | null;
  dumped: boolean;
} | null {
  if (src.kind === 'slot') {
    const slot = slots.find(
      (s) => s.vn_id === src.vn_id && s.release_id === src.release_id,
    );
    if (slot) return slot;
  }
  const pooled = pool.find(
    (e) => e.vn_id === src.vn_id && e.release_id === src.release_id,
  );
  if (pooled) {
    return {
      vn_title: pooled.vn_title,
      vn_image_thumb: pooled.vn_image_thumb,
      vn_image_url: pooled.vn_image_url,
      vn_local_image_thumb: pooled.vn_local_image_thumb,
      vn_image_sexual: pooled.vn_image_sexual,
      edition_label: pooled.edition_label,
      box_type: pooled.box_type,
      condition: pooled.condition,
      dumped: pooled.dumped,
    };
  }
  return null;
}

function shelfSlotToShelfEntry(slot: ShelfSlotEntry): ShelfEntry {
  return {
    vn_id: slot.vn_id,
    release_id: slot.release_id,
    notes: null,
    location: 'unknown',
    physical_location: [],
    box_type: slot.box_type,
    edition_label: slot.edition_label,
    condition: slot.condition,
    price_paid: null,
    currency: null,
    acquired_date: null,
    dumped: slot.dumped,
    added_at: 0,
    vn_title: slot.vn_title,
    vn_image_thumb: slot.vn_image_thumb,
    vn_image_url: slot.vn_image_url,
    vn_local_image_thumb: slot.vn_local_image_thumb,
    vn_image_sexual: slot.vn_image_sexual,
  };
}
