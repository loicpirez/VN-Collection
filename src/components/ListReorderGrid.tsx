'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
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
import { VnCard, type CardData } from './VnCard';
import { ListRemoveVn } from './ListRemoveVn';
import { useToast } from './ToastProvider';
import { readApiError } from '@/lib/api-error-read';

export interface ListReorderItem {
  vn_id: string;
  card: CardData | null;
}

interface Props {
  listId: number;
  items: ListReorderItem[];
  className?: string;
  style?: React.CSSProperties;
  reorderHint: string;
  reorderKeyboardHint: string;
  errorLabel: string;
}

/**
 * Drag-reorderable grid for one user list's members. Each cell keeps its
 * own remove control; the rest of the card is the drag surface (6 px
 * activation distance so a click still navigates to the VN page).
 *
 * A drop optimistically reorders the local list and POSTs
 * `/api/lists/[id]/items` with the new `{ order }` of VN ids. A failed
 * write rolls back and surfaces a toast. Pointer, touch, and keyboard
 * (Space/Enter to pick up, arrows to move, Space/Enter to drop) gestures
 * are all wired.
 */
export function ListReorderGrid({
  listId,
  items,
  className,
  style,
  reorderHint,
  reorderKeyboardHint,
  errorLabel,
}: Props) {
  const toast = useToast();
  const [order, setOrder] = useState<ListReorderItem[]>(items);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setOrder(items);
  }, [items]);

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

  async function persist(next: ListReorderItem[], previous: ListReorderItem[]) {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await fetch(`/api/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: next.map((it) => it.vn_id) }),
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
    const oldIndex = order.findIndex((it) => it.vn_id === active.id);
    const newIndex = order.findIndex((it) => it.vn_id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const previous = order;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    void persist(next, previous);
  }

  return (
    <>
      <p className="sr-only">{reorderKeyboardHint}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order.map((it) => it.vn_id)} strategy={rectSortingStrategy}>
          <ul className={`${className ?? ''} ${saving ? 'opacity-60' : ''}`} style={style}>
            {order.map((it) => (
              <SortableListCard
                key={it.vn_id}
                item={it}
                listId={listId}
                reorderHint={reorderHint}
                disabled={saving}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  );
}

function SortableListCard({
  item,
  listId,
  reorderHint,
  disabled,
}: {
  item: ListReorderItem;
  listId: number;
  reorderHint: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.vn_id,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    WebkitUserDrag: 'none' as const,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-roledescription="sortable item"
      title={reorderHint}
      className={`group relative block w-full min-w-0 touch-none select-none ${
        disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'opacity-40' : ''}`}
      onDragStart={(event) => event.preventDefault()}
    >
      <ListRemoveVn listId={listId} vnId={item.vn_id} />
      {item.card ? <VnCard data={item.card} /> : <StubCard vnId={item.vn_id} />}
    </li>
  );
}

export function StubCard({ vnId }: { vnId: string }) {
  return (
    <Link
      href={`/vn/${vnId}`}
      className="group relative flex aspect-[2/3] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-bg-elev/30 p-4 text-center text-muted hover:border-accent hover:text-white"
    >
      <ListChecks className="h-6 w-6" aria-hidden />
      <span className="font-mono text-xs">{vnId}</span>
    </Link>
  );
}
