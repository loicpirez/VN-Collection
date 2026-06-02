'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Clock, ListOrdered } from 'lucide-react';
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SafeImage } from './SafeImage';
import { HomeSectionControls, useHomeSection } from './HomeSectionMenu';
import { useToast } from './ToastProvider';
import { readApiError } from '@/lib/api-error-read';
import { formatMinutes } from '@/lib/format';
import type { Locale } from '@/lib/i18n/dictionaries';
import type { HomeSectionState } from '@/lib/home-section-layout';

export interface ReadingQueueEntry {
  position: number;
  vn_id: string;
  title: string;
  image_url: string | null;
  image_thumb: string | null;
  local_image_thumb: string | null;
  image_sexual: number | null;
  predictedMinutes: number | null;
}

interface Props {
  title: string;
  entries: ReadingQueueEntry[];
  initialState?: HomeSectionState;
  locale: Locale;
  units: { hoursUnit: string; minutesUnit: string };
  reorderHint: string;
  reorderKeyboardHint: string;
  youLabel: string;
  errorLabel: string;
}

/**
 * Client-side renderer for ReadingQueueStrip. Owns the visibility /
 * collapse state via `useHomeSection`; the parent server component
 * supplies the queue data and the personal reading-speed estimate (so the
 * DB query and the server-only estimator stay on the server).
 *
 * Entries are drag-reorderable via @dnd-kit. A drop optimistically reorders
 * the local list and PATCHes `/api/reading-queue` with the new `{ ids }`
 * ordering; a failed write rolls back and surfaces a toast. Pointer, touch,
 * and keyboard (Space/Enter to pick up, arrows to move, Space/Enter to drop)
 * gestures are all wired. A short pointer movement passes through as a click
 * so the underlying <Link> still navigates to the VN page.
 */
export function ReadingQueueStripView({
  title,
  entries,
  initialState,
  locale,
  units,
  reorderHint,
  reorderKeyboardHint,
  youLabel,
  errorLabel,
}: Props) {
  const { state, busy, isHidden, isCollapsed, toggleCollapsed, hide } = useHomeSection(
    'reading-queue',
    initialState,
  );
  const toast = useToast();
  const [order, setOrder] = useState<ReadingQueueEntry[]>(entries);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setOrder(entries);
  }, [entries]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function persist(next: ReadingQueueEntry[], previous: ReadingQueueEntry[]) {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await fetch('/api/reading-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map((e) => e.vn_id) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await readApiError(response, errorLabel));
    } catch (e) {
      if (controller.signal.aborted) return;
      setOrder(previous);
      toast.error(`${errorLabel}: ${(e as Error).message}`);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  function onDragEnd(event: DragEndEvent) {
    if (savingRef.current) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.findIndex((e) => e.vn_id === active.id);
    const newIndex = order.findIndex((e) => e.vn_id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const previous = order;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    void persist(next, previous);
  }

  if (isHidden) return null;

  return (
    <aside className="rounded-xl border border-border bg-bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted">
          <ListOrdered className="h-3.5 w-3.5 text-accent" aria-hidden /> {title}
          <span className="text-[10px] font-normal text-muted">/ {order.length}</span>
        </h3>
        <HomeSectionControls
          state={state}
          busy={busy}
          onCollapseToggle={toggleCollapsed}
          onHide={hide}
          sectionLabel={title}
        />
      </div>
      {!isCollapsed && (
        <>
          <p className="sr-only">{reorderKeyboardHint}</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order.map((e) => e.vn_id)} strategy={rectSortingStrategy}>
              <ol className={`flex flex-wrap gap-2 ${saving ? 'opacity-60' : ''}`}>
                {order.map((e, index) => (
                  <QueueChip
                    key={e.vn_id}
                    entry={e}
                    position={index + 1}
                    locale={locale}
                    units={units}
                    youLabel={youLabel}
                    reorderHint={reorderHint}
                    disabled={saving}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        </>
      )}
    </aside>
  );
}

function QueueChip({
  entry,
  position,
  locale,
  units,
  youLabel,
  reorderHint,
  disabled,
}: {
  entry: ReadingQueueEntry;
  position: number;
  locale: Locale;
  units: { hoursUnit: string; minutesUnit: string };
  youLabel: string;
  reorderHint: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.vn_id,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    WebkitUserDrag: 'none' as const,
  };
  const predicted = formatMinutes(entry.predictedMinutes, locale, units, { fallback: '' });
  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-roledescription="sortable item"
      title={reorderHint}
      className={`touch-none select-none ${disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} ${
        isDragging ? 'opacity-40' : ''
      }`}
      onDragStart={(event) => event.preventDefault()}
    >
      <Link
        href={`/vn/${entry.vn_id}`}
        className="group flex items-center gap-2 rounded-md bg-bg-elev/40 px-2 py-1 text-xs hover:bg-bg-elev"
      >
        <span className="font-mono text-[10px] text-muted">{position}</span>
        <div className="h-8 w-6 overflow-hidden rounded">
          <SafeImage
            src={entry.image_url || entry.image_thumb}
            localSrc={entry.local_image_thumb}
            sexual={entry.image_sexual}
            alt={entry.title}
            className="h-full w-full"
          />
        </div>
        <span title={entry.title} className="line-clamp-1 max-w-[200px] font-semibold transition-colors can-hover:group-hover:text-accent">
          {entry.title}
        </span>
        {predicted && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-bg-card/70 px-1.5 py-0.5 font-mono text-[10px] text-accent">
            <Clock className="h-3 w-3" aria-hidden />
            {youLabel} ≈ {predicted}
          </span>
        )}
      </Link>
    </li>
  );
}
