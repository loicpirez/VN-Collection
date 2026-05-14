'use client';
import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { VnCard } from './VnCard';
import type { CollectionItem, Status } from '@/lib/types';

interface Props {
  items: CollectionItem[];
  /** Called with the new id ordering after a successful drop. */
  onReorder: (orderedIds: string[]) => void;
  /** Dense grid (matches the comfortable/dense toggle on the library). */
  dense?: boolean;
}

/**
 * Polished sortable grid using @dnd-kit. The **entire card** is the drag
 * surface — no separate grip handle. A short pointer movement (< 6 px)
 * passes through as a click so the underlying <Link> still navigates to
 * the VN page; anything beyond that starts the drag. dnd-kit's
 * PointerSensor doesn't pre-empt the click chain, so the favorite heart
 * and lists picker overlays on the card still receive their own clicks
 * without engaging the drag.
 *
 * Drop targets shift around the cursor, the picked-up card lifts with a
 * DragOverlay (scale + shadow), and the rest of the grid animates into
 * place via CSS transforms. Touch + keyboard (Space/Enter to pick up,
 * arrow keys to move, Space/Enter to drop) supported for free via
 * @dnd-kit's keyboard sensor.
 */
export function SortableGrid({ items, onReorder, dense = false }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // 6 px activation distance — small enough to feel responsive, large
  // enough that a click on the favorite / lists / context-menu overlays
  // never accidentally engages the drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((it) => it.id === active.id);
    const newIdx = items.findIndex((it) => it.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(items, oldIdx, newIdx);
    onReorder(next.map((it) => it.id));
  }

  const activeItem = activeId ? items.find((it) => it.id === activeId) ?? null : null;
  const ids = items.map((it) => it.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div
          className={
            dense
              ? 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10'
              : 'grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
          }
        >
          {items.map((it) => (
            <SortableCard key={it.id} item={it} isDragGhost={false} />
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeItem ? (
          <div className="rotate-[2deg] cursor-grabbing">
            <div className="rounded-xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] ring-2 ring-accent">
              <CardInner item={activeItem} />
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableCard({ item, isDragGhost }: { item: CollectionItem; isDragGhost: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    transition: { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  });
  // `block w-full min-w-0` keeps the wrapper bound to its grid column on
  // drop. Without it, certain combinations of dnd-kit transforms +
  // Tailwind's `select-none` were leaving the wrapper sized by intrinsic
  // content (= bigger than the column) after the drag settled.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Suppress the browser's native HTML5 drag preview on the underlying
    // <Link> so dnd-kit's DragOverlay is the only thing the user sees.
    WebkitUserDrag: 'none' as const,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-roledescription="sortable item"
      className={`group/sortable relative block w-full min-w-0 cursor-grab touch-none select-none active:cursor-grabbing ${
        isDragging ? 'opacity-30 saturate-50' : ''
      }`}
      onDragStart={(e) => e.preventDefault()}
    >
      {!isDragGhost && <CardInner item={item} />}
    </div>
  );
}

function CardInner({ item }: { item: CollectionItem }) {
  return (
    <VnCard
      data={{
        id: item.id,
        title: item.title,
        alttitle: item.alttitle,
        poster: item.image_url || item.image_thumb,
        localPoster: item.local_image || item.local_image_thumb,
        customCover: item.custom_cover,
        sexual: item.image_sexual,
        released: item.released,
        egs_median: item.egs?.median ?? null,
        egs_playtime_minutes: item.egs?.playtime_median_minutes ?? null,
        rating: item.rating,
        user_rating: item.user_rating,
        playtime_minutes: item.playtime_minutes,
        length_minutes: item.length_minutes,
        status: item.status as Status | undefined,
        favorite: item.favorite,
        developers: item.developers,
        publishers: item.publishers,
        isFanDisc: (item.relations ?? []).some((r) => r.relation === 'orig'),
      }}
    />
  );
}
