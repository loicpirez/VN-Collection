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
  VN_LAYOUT_EVENT,
  VN_SECTION_IDS,
  defaultVnDetailLayoutV1,
  validateVnDetailLayoutV1,
  type VnDetailLayoutV1,
  type VnSectionId,
  type VnSectionState,
} from '@/lib/vn-detail-layout';

export interface VnDetailSection {
  /** Stable id matching `VnSectionId` — also the key used in the layout config. */
  id: VnSectionId;
  /**
   * Pre-rendered section JSX. Hidden sections never receive their
   * node — we still build the array so unknown / not-applicable
   * sections (e.g. notes when vn.notes is empty) can be omitted by
   * the parent without breaking layout indices.
   */
  node: React.ReactNode;
}

interface Props {
  vnId: string;
  initialLayout: VnDetailLayoutV1;
  sections: VnDetailSection[];
}

/**
 * Host for the customizable region of `/vn/[id]`. Renders sections in
 * the user's saved order, skipping hidden ones entirely (no mount =
 * no heavy fetch). Toggling "Edit layout" reveals drag handles, hide
 * buttons, and a "collapsed by default" toggle per section. Changes
 * commit on "Save"; "Reset" wipes the config back to defaults.
 *
 * The main identity card (title / cover / synopsis / media) is NOT
 * in here — those live above the host on /vn/[id]/page.tsx and are
 * intentionally not user-reorderable.
 *
 * The "collapsed by default" toggle only governs the initial open
 * state of each section's local collapse — sections that already use
 * their own `<details>` (Characters, Releases, Quotes) keep that
 * native behavior, while non-`<details>` sections get a layout-owned
 * wrapper with a chevron.
 */
export function VnDetailLayout({ vnId, initialLayout, sections }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [layout, setLayout] = useState<VnDetailLayoutV1>(initialLayout);
  const [editMode, setEditMode] = useState(false);
  // Working copy while editing — committed on "Save", discarded on "Cancel".
  const [draft, setDraft] = useState<VnDetailLayoutV1>(initialLayout);
  const [saving, setSaving] = useState(false);

  // Re-sync the working copy whenever a fresh `initialLayout` arrives
  // (server re-fetch after a related action).
  useEffect(() => {
    setLayout(initialLayout);
    if (!editMode) setDraft(initialLayout);
  }, [initialLayout, editMode]);

  // Listen for layout changes coming from the Settings modal "Restore
  // hidden VN sections" panel so the page stays in sync without a
  // full router.refresh().
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ layout?: VnDetailLayoutV1 }>).detail;
      if (!detail?.layout) return;
      setLayout(detail.layout);
      if (!editMode) setDraft(detail.layout);
    }
    window.addEventListener(VN_LAYOUT_EVENT, onChange);
    return () => window.removeEventListener(VN_LAYOUT_EVENT, onChange);
  }, [editMode]);

  const sectionMap = useMemo(() => {
    const m = new Map<VnSectionId, React.ReactNode>();
    for (const s of sections) m.set(s.id, s.node);
    return m;
  }, [sections]);

  // Active layout = draft when editing, persisted layout when not.
  const active = editMode ? draft : layout;

  // Renderable ids = ids in `order` that exist in the section map.
  // Skipping a section here means its component never mounts.
  const visibleIds = useMemo(
    () => active.order.filter((id) => sectionMap.has(id) && active.sections[id].visible),
    [active.order, active.sections, sectionMap],
  );

  // Edit mode shows ALL applicable sections (even hidden ones) so the
  // user can re-show them. Non-applicable sections (no node) are
  // still skipped — there's nothing to surface.
  const editIds = useMemo(
    () => active.order.filter((id) => sectionMap.has(id)),
    [active.order, sectionMap],
  );

  // Reset draft.order to canonical when the user clicks Reset; the
  // server reload after Save brings persisted state back into line.
  const reset = useCallback(() => {
    setDraft(defaultVnDetailLayoutV1());
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vn_detail_section_layout_v1: draft }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      // Round-trip through the validator locally too so what we
      // optimistically apply matches what the server stored.
      const normalized = validateVnDetailLayoutV1(draft);
      setLayout(normalized);
      setDraft(normalized);
      setEditMode(false);
      window.dispatchEvent(
        new CustomEvent(VN_LAYOUT_EVENT, { detail: { layout: normalized } }),
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

  // DnD sensors: small activation distance so a click on the
  // chevron/hide button passes through without engaging the drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active: from, over } = e;
    if (!over || from.id === over.id) return;
    const oldIdx = draft.order.indexOf(from.id as VnSectionId);
    const newIdx = draft.order.indexOf(over.id as VnSectionId);
    if (oldIdx === -1 || newIdx === -1) return;
    setDraft((d) => ({ ...d, order: arrayMove(d.order, oldIdx, newIdx) }));
  }

  function patchSection(id: VnSectionId, patch: Partial<VnSectionState>) {
    setDraft((d) => ({
      ...d,
      sections: { ...d.sections, [id]: { ...d.sections[id], ...patch } },
    }));
  }

  return (
    <>
      {/* Edit-layout toolbar — anchored above the customizable area.
          Sits outside the dnd context so its buttons never become
          drag targets themselves. */}
      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted">
          {t.vnLayout.sectionsHeading}
        </h2>
        {editMode ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-on_hold hover:text-status-on_hold"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> {t.vnLayout.reset}
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
              <Save className="h-3.5 w-3.5" aria-hidden /> {t.vnLayout.save}
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
            title={t.vnLayout.editHint}
          >
            <Layout className="h-3 w-3" aria-hidden /> {t.vnLayout.edit}
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
                  label={t.vnLayout.sectionLabels[id]}
                  hideLabel={t.vnLayout.hide}
                  showLabel={t.vnLayout.show}
                  collapseByDefaultLabel={t.vnLayout.collapseByDefault}
                  dragHandleLabel={t.vnLayout.dragHandle}
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
                label={t.vnLayout.sectionLabels[id]}
                expandLabel={t.vnLayout.expand}
                collapseLabel={t.vnLayout.collapse}
              />
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * Section as rendered in normal (non-edit) mode. If the layout marks
 * the section as collapsed-by-default the body starts hidden behind a
 * lightweight `<details>` wrapper; sections that already own their
 * own collapse (Characters, Releases, Quotes) ignore this and rely
 * on the inner component's native chevron.
 */
function SectionWrapper({
  id,
  node,
  state,
  label,
  expandLabel,
  collapseLabel,
}: {
  id: VnSectionId;
  node: React.ReactNode;
  state: VnSectionState;
  label: string;
  expandLabel: string;
  collapseLabel: string;
}) {
  // Sections that already use a native `<details>` (those that lazy-load
  // on open) handle their own collapse — wrapping them again would
  // create a second chevron and either UX is fine to leave to the inner
  // component. List kept in sync with the actual section implementations.
  const HAS_INTERNAL_COLLAPSE: ReadonlySet<VnSectionId> = new Set<VnSectionId>([
    'characters',
    'releases',
    'quotes',
  ]);

  if (HAS_INTERNAL_COLLAPSE.has(id) || !state.collapsedByDefault) {
    // `id="section-<id>"` lets the identity metadata row link to
    // each section (e.g. "#section-aspect-override").
    return (
      <section id={`section-${id}`} className="scroll-mt-24">
        {node}
      </section>
    );
  }
  // Wrap non-internal-collapse sections so the user-saved "collapsed
  // by default" preference takes effect.
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
  id: VnSectionId;
  state: VnSectionState;
  label: string;
  hideLabel: string;
  showLabel: string;
  collapseByDefaultLabel: string;
  dragHandleLabel: string;
  onPatch: (patch: Partial<VnSectionState>) => void;
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

/** Defensive helper so missing locale keys never null-out the page. */
export function isValidVnSectionId(id: string): id is VnSectionId {
  return (VN_SECTION_IDS as readonly string[]).includes(id);
}
