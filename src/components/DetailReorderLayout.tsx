'use client';
/**
 * Generic section-reorder host for detail pages (character, staff, producer).
 *
 * Follows the same model as VnDetailLayout but is parameterised so
 * character / staff / producer don't each need their own copy.
 *
 * - Normal mode: renders each section's `node` directly with NO extra
 *   chrome. The section renders exactly as the page author wrote it.
 * - Edit mode: adds a floating drag handle + hide toggle per section.
 *   A "Layout" chip in the toolbar activates edit mode.
 * - Persists via PATCH /api/settings under the provided `settingsKey`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, LayoutList, RotateCcw, Save, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

export interface DetailSection {
  id: string;
  node: React.ReactNode;
  /** Display label used in edit mode and as the collapsed-section header. */
  label?: string;
}

export interface SectionLayoutV1 {
  sections: Record<string, { visible: boolean; collapsedByDefault?: boolean }>;
  order: string[];
}

interface Props {
  /** Ordered list of sections that have content. Hidden sections must still appear here. */
  sections: DetailSection[];
  /** Initial layout state from server-side settings read. */
  initialLayout: SectionLayoutV1;
  /** Canonical full list of section ids (for order reference). */
  sectionIds: readonly string[];
  /** Settings key used by PATCH /api/settings. */
  settingsKey: string;
  /** CustomEvent name dispatched after a save. */
  eventName: string;
}

function defaultSectionLayoutV1(sectionIds: readonly string[]): SectionLayoutV1 {
  const sections: Record<string, { visible: boolean; collapsed?: boolean }> = {};
  for (const id of sectionIds) sections[id] = { visible: true };
  return { sections, order: [...sectionIds] };
}

export function DetailReorderLayout({
  sections,
  initialLayout,
  sectionIds,
  settingsKey,
  eventName,
}: Props) {
  const t = useT();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<SectionLayoutV1>(initialLayout);
  const [draft, setDraft] = useState<SectionLayoutV1>(initialLayout);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ layout?: SectionLayoutV1 }>).detail;
      if (detail?.layout) {
        setLayout(detail.layout);
        setDraft(detail.layout);
      }
    };
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [eventName]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const orderedSections = useMemo(() => {
    const order = editing ? draft.order : layout.order;
    const stateMap = editing ? draft.sections : layout.sections;
    const sorted: Array<{ id: string; node: React.ReactNode; visible: boolean }> = [];
    const sectionMap = new Map(sections.map((s) => [s.id, s]));
    for (const id of order) {
      const s = sectionMap.get(id);
      if (!s) continue;
      sorted.push({ id, node: s.node, visible: stateMap[id]?.visible ?? true });
    }
    for (const s of sections) {
      if (!sorted.find((x) => x.id === s.id)) {
        sorted.push({ id: s.id, node: s.node, visible: stateMap[s.id]?.visible ?? true });
      }
    }
    return sorted;
  }, [sections, layout, draft, editing]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((prev) => {
      const oldIndex = prev.order.indexOf(String(active.id));
      const newIndex = prev.order.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;
      return { ...prev, order: arrayMove(prev.order, oldIndex, newIndex) };
    });
  }

  function toggleVisible(id: string) {
    setDraft((prev) => ({
      ...prev,
      sections: {
        ...prev.sections,
        [id]: { ...prev.sections[id], visible: !(prev.sections[id]?.visible ?? true) },
      },
    }));
  }

  function toggleCollapsed(id: string) {
    setDraft((prev) => ({
      ...prev,
      sections: {
        ...prev.sections,
        [id]: { ...prev.sections[id], collapsedByDefault: !(prev.sections[id]?.collapsedByDefault ?? false) },
      },
    }));
  }

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [settingsKey]: draft }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLayout(draft);
      setEditing(false);
      window.dispatchEvent(new CustomEvent(eventName, { detail: { layout: draft } }));
      toast.success(t.layout.saved);
    } catch {
      toast.error(t.layout.saveError);
    } finally {
      setSaving(false);
    }
  }, [draft, settingsKey, eventName, toast, t]);

  function cancel() {
    setDraft(layout);
    setEditing(false);
  }

  function reset() {
    setDraft(defaultSectionLayoutV1(sectionIds));
  }

  if (!editing) {
    return (
      <>
        {orderedSections.map(({ id, node, visible }) => {
          if (!visible) return null;
          const isCollapsed = layout.sections[id]?.collapsedByDefault ?? false;
          const sec = sections.find((s) => s.id === id);
          if (isCollapsed && sec?.label) {
            return (
              <CollapsibleSectionHeader key={id} label={sec.label}>
                {node}
              </CollapsibleSectionHeader>
            );
          }
          return <div key={id}>{node}</div>;
        })}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => { setDraft(layout); setEditing(true); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elev/40 px-2.5 py-1 text-[11px] text-muted hover:border-accent hover:text-accent transition-colors"
            title={t.layout.editLayout}
          >
            <LayoutList className="h-3.5 w-3.5" aria-hidden /> {t.layout.editLayout}
          </button>
        </div>
      </>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3">
        <LayoutList className="h-4 w-4 text-accent" aria-hidden />
        <span className="text-xs font-bold text-accent">{t.layout.editLayout}</span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={reset} className="btn text-xs" title={t.layout.reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t.layout.reset}
          </button>
          <button type="button" onClick={cancel} className="btn text-xs">
            <X className="h-3.5 w-3.5" aria-hidden /> {t.common.cancel}
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn btn-primary text-xs">
            <Save className="h-3.5 w-3.5" aria-hidden /> {saving ? t.common.loading : t.layout.save}
          </button>
        </span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={draft.order} strategy={verticalListSortingStrategy}>
          {orderedSections.map(({ id, node, visible }) => {
            const sec = sections.find((s) => s.id === id);
            const collapsed = draft.sections[id]?.collapsedByDefault ?? false;
            return (
              <SortableSection
                key={id}
                id={id}
                node={node}
                visible={visible}
                label={sec?.label}
                collapsed={collapsed}
                onToggleVisible={() => toggleVisible(id)}
                onToggleCollapsed={sec?.label ? () => toggleCollapsed(id) : undefined}
              />
            );
          })}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableSection({
  id,
  node,
  visible,
  label,
  collapsed,
  onToggleVisible,
  onToggleCollapsed,
}: {
  id: string;
  node: React.ReactNode;
  visible: boolean;
  label?: string;
  collapsed: boolean;
  onToggleVisible: () => void;
  onToggleCollapsed?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const t = useT();

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Floating edit-mode controls — don't touch the section's own chrome */}
      <div className="absolute right-2 top-2 z-30 flex items-center gap-1">
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-bg-card/90 text-muted hover:text-accent"
            title={collapsed ? t.layout.expandSection : t.layout.collapseSection}
          >
            {collapsed
              ? <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleVisible}
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-bg-card/90 text-muted hover:text-accent"
          title={visible ? t.layout.hideSection : t.layout.showSection}
        >
          {visible ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
        </button>
        <button
          type="button"
          className="cursor-grab inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-bg-card/90 text-muted hover:text-accent active:cursor-grabbing"
          title={t.layout.drag}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {label && (
        <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted/60 select-none pl-1">
          {label}
        </div>
      )}
      <div className={visible ? '' : 'opacity-30 pointer-events-none select-none'}>
        {node}
      </div>
    </div>
  );
}

function CollapsibleSectionHeader({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useLocalCollapse(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center gap-2 text-left text-xs font-bold uppercase tracking-widest text-muted hover:text-white transition-colors"
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        {label}
      </button>
      {open && children}
    </div>
  );
}

function useLocalCollapse(initial: boolean): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  return useState(initial);
}
