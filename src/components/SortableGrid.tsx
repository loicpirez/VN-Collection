'use client';
import { memo, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
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
import { toCardData } from './cardData';
import type { CollectionCardApiItem } from '@/lib/types';
import { useT } from '@/lib/i18n/client';

interface Props {
  items: CollectionCardApiItem[];
  /** Called with the new id ordering after a successful drop. */
  onReorder: (orderedIds: string[]) => void;
  /** Dense grid (matches the comfortable/dense toggle on the library). */
  dense?: boolean;
  /** Prevent drag interactions while the current order is being persisted. */
  disabled?: boolean;
}

/**
 * Polished sortable grid using @dnd-kit. The **entire card** is the drag
 * surface - no separate grip handle. A short pointer movement (< 6 px)
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
export function SortableGrid({ items, onReorder, dense = false, disabled = false }: Props) {
  const t = useT();
  const [activeId, setActiveId] = useState<string | null>(null);
  // 6 px activation distance - small enough to feel responsive, large
  // enough that a click on the favorite / lists / context-menu overlays
  // never accidentally engages the drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Long-press to engage on touch - without this, mobile users
    // couldn't drag at all on iOS (where Pointer events behave more
    // like clicks unless the finger moves significantly first).
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(e: DragStartEvent) {
    if (disabled) return;
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (disabled) return;
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
      {/* Visually-hidden hint announcing the keyboard drag-and-drop
          contract. dnd-kit's KeyboardSensor is wired above; this gives
          screen-reader users a discoverable summary of the gesture. */}
      <p className="sr-only">{t.lists.reorderKeyboardHint}</p>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, calc(var(--card-density-px, 220px) * ${dense ? 0.72 : 1})), 1fr))`,
          }}
        >
          {items.map((it) => (
            <SortableCard key={it.id} item={it} isDragGhost={false} disabled={disabled} />
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

function SortableCard({ item, isDragGhost, disabled }: { item: CollectionCardApiItem; isDragGhost: boolean; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
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
      className={`group/sortable relative block w-full min-w-0 touch-none select-none ${
        disabled ? 'cursor-not-allowed opacity-70' : 'cursor-grab active:cursor-grabbing'
      } ${
        isDragging ? 'opacity-30 saturate-50' : ''
      }`}
      onDragStart={(e) => e.preventDefault()}
    >
      {!isDragGhost && <CardInner item={item} />}
    </div>
  );
}

const CardInner = memo(function CardInner({ item }: { item: CollectionCardApiItem }) {
  const data = useMemo(() => toCardData(item), [item]);
  return <VnCard data={data} />;
});
