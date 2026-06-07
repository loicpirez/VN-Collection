'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Eye, EyeOff, GripVertical, RotateCcw, X } from 'lucide-react';
import {
  HOME_LAYOUT_EVENT,
  type HomeSectionId,
  type HomeSectionLayoutV1,
} from '@/lib/home-section-layout';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { DialogPortal, useDialogA11y } from './Dialog';

import { readApiError } from '@/lib/api-error-read';
/**
 * Custom event name dispatched by sibling components to open the
 * home-layout editor dialog. Multiple call sites can request the
 * dialog (LibraryClient's Options menu, Settings -> Home tab CTA,
 * keyboard shortcut, etc.) without rendering a redundant trigger
 * button each.
 */
export const HOME_LAYOUT_OPEN_EVENT = 'vn:open-home-layout';

export function HomeLayoutEditorTrigger({ layout }: { layout: HomeSectionLayoutV1 }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<HomeSectionId[]>(layout.order);
  const [sections, setSections] = useState(layout.sections);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const mutationAbortRef = useRef<AbortController | null>(null);

  useDialogA11y({ open, onClose: () => { if (!inFlightRef.current) setOpen(false); }, panelRef });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      inFlightRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, []);

  // Listen for cross-component open requests. Any sibling can fire
  // `window.dispatchEvent(new CustomEvent('vn:open-home-layout'))`
  // and this dialog flips open. Closing flips back; the local
  // `open` state is the canonical truth.
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener(HOME_LAYOUT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(HOME_LAYOUT_OPEN_EVENT, onOpen);
  }, []);

  // Reset local state when the dialog re-opens (in case settings changed
  // elsewhere while it was closed).
  useEffect(() => {
    if (open) {
      setOrder(layout.order);
      setSections(layout.sections);
    }
  }, [open, layout.order, layout.sections]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const persist = useCallback(
    async (patch: { order?: HomeSectionId[]; sections?: Partial<typeof sections> }) => {
      const controller = new AbortController();
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = controller;
      inFlightRef.current = true;
      setBusy(true);
      try {
        const r = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ home_section_layout_v1: patch }),
          signal: controller.signal,
        });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
        window.dispatchEvent(new CustomEvent(HOME_LAYOUT_EVENT, { detail: patch }));
        router.refresh();
      } catch (e) {
        if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
        setOrder(layout.order);
        setSections(layout.sections);
        toast.error((e as Error).message);
      } finally {
        if (mutationAbortRef.current === controller) {
          mutationAbortRef.current = null;
          inFlightRef.current = false;
          setBusy(false);
        }
      }
    },
    [t.common.error, router, toast, layout.order, layout.sections],
  );

  function onDragEnd(event: DragEndEvent) {
    if (inFlightRef.current) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as HomeSectionId);
    const newIndex = order.indexOf(over.id as HomeSectionId);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    void persist({ order: next });
  }

  function toggleVisible(id: HomeSectionId) {
    if (inFlightRef.current) return;
    const cur = sections[id];
    const next = { ...sections, [id]: { ...cur, visible: !cur.visible } };
    setSections(next);
    void persist({ sections: { [id]: next[id] } });
  }

  async function resetAll() {
    if (inFlightRef.current) return;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_section_layout_v1: null }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      window.dispatchEvent(new CustomEvent(HOME_LAYOUT_EVENT, { detail: { reset: true } }));
      router.refresh();
      setOpen(false);
    } catch (e) {
      if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
        if (mutationAbortRef.current === controller) {
          mutationAbortRef.current = null;
          inFlightRef.current = false;
          setBusy(false);
        }
      }
  }

  return (
    <>
      {/*
        No standalone page-level trigger anymore - the user explicitly
        rejected the floating icon. The dialog opens via:
          - window.dispatchEvent(new CustomEvent('vn:open-home-layout'))
          - dispatched from LibraryClient's "Options" menu, the
            Settings -> Home tab, and any future call site.
        Keep the dialog markup mounted so it can flip open instantly.
      */}
      {open && (
        <DialogPortal>
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-bg/80 backdrop-blur"
            onClick={() => { if (!inFlightRef.current) setOpen(false); }}
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onClick={(e) => e.stopPropagation()}
              className="w-[min(calc(100vw-1rem),520px)] max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-bg-card p-4 sm:p-5 shadow-card"
            >
            <header className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-base font-bold">{t.homeLayout.title}</h2>
                <p className="mt-0.5 text-[11px] text-muted">{t.homeLayout.hint}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label={t.common.close}
                className="tap-target rounded text-muted hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1">
                  {order.map((id) => (
                    <SortableHomeRow
                      key={id}
                      id={id}
                      visible={sections[id].visible !== false}
                      label={t.homeLayout.sectionLabels[id]}
                      onToggleVisible={() => toggleVisible(id)}
                      busy={busy}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>

            <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-[11px] text-muted">{t.homeLayout.persistedHint}</p>
              <button
                type="button"
                onClick={resetAll}
                disabled={busy}
                className="btn btn-xs"
                title={t.homeLayout.reset}
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                <span>{t.homeLayout.reset}</span>
              </button>
            </footer>
            </div>
          </div>
        </DialogPortal>
      )}
    </>
  );
}

function SortableHomeRow({
  id,
  visible,
  label,
  onToggleVisible,
  busy,
}: {
  id: HomeSectionId;
  visible: boolean;
  label: string;
  onToggleVisible: () => void;
  busy: boolean;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: busy,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border bg-bg-elev/30 px-2 py-1.5"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t.homeLayout.dragHandle}
        disabled={busy}
        className="tap-target-tight cursor-grab text-muted hover:text-white"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span className={`flex-1 text-[11px] ${visible ? 'text-white' : 'text-muted line-through'}`}>
        {label}
      </span>
      <button
        type="button"
        onClick={onToggleVisible}
        disabled={busy}
        aria-pressed={!visible}
        aria-label={visible ? t.homeLayout.hideSection : t.homeLayout.showSection}
        title={visible ? t.homeLayout.hideSection : t.homeLayout.showSection}
        className="tap-target-tight inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-accent disabled:opacity-50"
      >
        {visible ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </li>
  );
}
