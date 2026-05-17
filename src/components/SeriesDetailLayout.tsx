'use client';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
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
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  Layout,
  RotateCcw,
  Save,
} from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import {
  SERIES_DETAIL_LAYOUT_EVENT,
  SERIES_DETAIL_SECTION_IDS,
  defaultSeriesDetailLayoutV1,
  validateSeriesDetailLayoutV1,
  type SeriesDetailLayoutV1,
  type SeriesSectionId,
  type SeriesSectionState,
} from '@/lib/series-detail-layout';

export interface SeriesDetailSection {
  id: SeriesSectionId;
  node: React.ReactNode;
}

interface Props {
  initialLayout: SeriesDetailLayoutV1;
  sections: SeriesDetailSection[];
}

/**
 * Host for the customizable region of `/series/[id]`. Mirrors the
 * shape of `<VnDetailLayout>` so the operator gets the same
 * "Edit layout" affordance — drag to reorder, hide / collapse per
 * section, persistence via `PATCH /api/settings`.
 *
 * The hero card (banner / cover / name / description) is wrapped here
 * as the `hero` section so the entire page is reorderable. Hiding
 * the hero is allowed — useful for the dense "works only" view some
 * collectors prefer.
 */
export function SeriesDetailLayout({ initialLayout, sections }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [layout, setLayout] = useState<SeriesDetailLayoutV1>(initialLayout);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<SeriesDetailLayoutV1>(initialLayout);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLayout(initialLayout);
    if (!editMode) setDraft(initialLayout);
  }, [initialLayout, editMode]);

  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ layout?: SeriesDetailLayoutV1 }>).detail;
      if (!detail?.layout) return;
      setLayout(detail.layout);
      if (!editMode) setDraft(detail.layout);
    }
    window.addEventListener(SERIES_DETAIL_LAYOUT_EVENT, onChange);
    return () => window.removeEventListener(SERIES_DETAIL_LAYOUT_EVENT, onChange);
  }, [editMode]);

  const sectionMap = useMemo(() => {
    const m = new Map<SeriesSectionId, React.ReactNode>();
    for (const s of sections) m.set(s.id, s.node);
    return m;
  }, [sections]);

  const active = editMode ? draft : layout;
  const visibleIds = useMemo(
    () => active.order.filter((id) => sectionMap.has(id) && active.sections[id].visible),
    [active.order, active.sections, sectionMap],
  );
  const editIds = useMemo(
    () => active.order.filter((id) => sectionMap.has(id)),
    [active.order, sectionMap],
  );

  const reset = useCallback(() => {
    setDraft(defaultSeriesDetailLayoutV1());
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_detail_section_layout_v1: draft }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const normalized = validateSeriesDetailLayoutV1(draft);
      setLayout(normalized);
      setDraft(normalized);
      setEditMode(false);
      window.dispatchEvent(
        new CustomEvent(SERIES_DETAIL_LAYOUT_EVENT, { detail: { layout: normalized } }),
      );
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [draft, toast, t.common.error, t.toast.saved, router]);

  const cancel = useCallback(() => {
    setDraft(layout);
    setEditMode(false);
  }, [layout]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active: from, over } = e;
    if (!over || from.id === over.id) return;
    const oldIdx = draft.order.indexOf(from.id as SeriesSectionId);
    const newIdx = draft.order.indexOf(over.id as SeriesSectionId);
    if (oldIdx === -1 || newIdx === -1) return;
    setDraft((d) => ({ ...d, order: arrayMove(d.order, oldIdx, newIdx) }));
  }

  function patchSection(id: SeriesSectionId, patch: Partial<SeriesSectionState>) {
    setDraft((d) => ({
      ...d,
      sections: { ...d.sections, [id]: { ...d.sections[id], ...patch } },
    }));
  }

  // i18n labels — fall back to the canonical id when a translation is missing
  // (the FR / EN / JA bundles all carry `seriesLayout.sectionLabels` but the
  // defensive fallback keeps an out-of-sync dictionary from blanking labels).
  const layoutDict = t.seriesLayout;

  return (
    <>
      <div className="mb-3 mt-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted">
          {layoutDict.sectionsHeading}
        </h2>
        {editMode ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-on_hold hover:text-status-on_hold"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> {layoutDict.reset}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:text-white"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn btn-primary"
            >
              <Save className="h-3.5 w-3.5" aria-hidden /> {layoutDict.save}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(layout);
              setEditMode(true);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
            title={layoutDict.editHint}
          >
            <Layout className="h-3 w-3" aria-hidden /> {layoutDict.edit}
          </button>
        )}
      </div>

      {editMode ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={editIds} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {editIds.map((id) => (
                <EditableRow
                  key={id}
                  id={id}
                  state={draft.sections[id]}
                  label={layoutDict.sectionLabels[id]}
                  hideLabel={layoutDict.hide}
                  showLabel={layoutDict.show}
                  collapseByDefaultLabel={layoutDict.collapseByDefault}
                  dragHandleLabel={layoutDict.dragHandle}
                  onPatch={(patch) => patchSection(id, patch)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-4">
          {visibleIds.map((id) => {
            const node = sectionMap.get(id);
            if (!node) return null;
            const state = active.sections[id];
            return (
              <SectionWrapper
                key={id}
                id={id}
                node={node}
                state={state}
                label={layoutDict.sectionLabels[id]}
                expandLabel={layoutDict.expand}
                collapseLabel={layoutDict.collapse}
              />
            );
          })}
        </div>
      )}
    </>
  );
}

function SectionWrapper({
  id,
  node,
  state,
  label,
  expandLabel,
  collapseLabel,
}: {
  id: SeriesSectionId;
  node: React.ReactNode;
  state: SeriesSectionState;
  label: string;
  expandLabel: string;
  collapseLabel: string;
}) {
  if (!state.collapsedByDefault) {
    return (
      <section id={`section-${id}`} className="scroll-mt-24">
        {node}
      </section>
    );
  }
  return (
    <section id={`section-${id}`} className="scroll-mt-24">
      <CollapsibleSection label={label} expandLabel={expandLabel} collapseLabel={collapseLabel}>
        {node}
      </CollapsibleSection>
    </section>
  );
}

function CollapsibleSection({
  label,
  expandLabel,
  collapseLabel,
  children,
}: {
  label: string;
  expandLabel: string;
  collapseLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-border bg-bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-bg-elev/40"
        title={open ? collapseLabel : expandLabel}
      >
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
          {label}
        </span>
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </section>
  );
}

function EditableRow({
  id,
  state,
  label,
  hideLabel,
  showLabel,
  collapseByDefaultLabel,
  dragHandleLabel,
  onPatch,
}: {
  id: SeriesSectionId;
  state: SeriesSectionState;
  label: string;
  hideLabel: string;
  showLabel: string;
  collapseByDefaultLabel: string;
  dragHandleLabel: string;
  onPatch: (patch: Partial<SeriesSectionState>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
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
      className={`flex items-center gap-2 rounded-lg border bg-bg-elev/40 px-3 py-2 ${
        isDragging ? 'border-accent shadow-card' : 'border-border'
      } ${state.visible ? '' : 'opacity-60'}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={dragHandleLabel}
        title={dragHandleLabel}
        className="tap-target-tight inline-flex h-7 w-7 cursor-grab items-center justify-center rounded text-muted hover:text-white active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{label}</span>
      <label className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-muted">
        <input
          type="checkbox"
          checked={state.collapsedByDefault}
          onChange={(e) => onPatch({ collapsedByDefault: e.target.checked })}
          className="h-3 w-3 accent-accent"
        />
        {collapseByDefaultLabel}
      </label>
      <button
        type="button"
        onClick={() => onPatch({ visible: !state.visible })}
        aria-pressed={!state.visible}
        title={state.visible ? hideLabel : showLabel}
        className={`tap-target-tight inline-flex h-7 w-7 items-center justify-center rounded ${
          state.visible
            ? 'text-muted hover:bg-bg-elev hover:text-white'
            : 'text-accent hover:bg-accent/10'
        }`}
      >
        {state.visible ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </li>
  );
}

export function isValidSeriesSectionId(id: string): id is SeriesSectionId {
  return (SERIES_DETAIL_SECTION_IDS as readonly string[]).includes(id);
}
