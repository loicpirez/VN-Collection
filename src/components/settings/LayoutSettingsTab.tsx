'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Check, Eye, EyeOff, GripVertical, Maximize2, Minimize2, RotateCcw, Settings2 } from 'lucide-react';
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
import {
  CARD_DENSITY_DEFAULT,
  CARD_DENSITY_MAX,
  CARD_DENSITY_MIN,
  DENSITY_SCOPES,
  clampCardDensity,
  clearAllScopeDensities,
  hasScopeOverride,
  resolveScopedDensity,
  type DensityScope,
  type DensityScopes,
  useDisplaySettings,
} from '@/lib/settings/client';
import {
  PAGE_SPACE_PRESET_IDS,
  PAGE_SPACE_SCOPES,
  PAGE_SPACE_SCOPE_DEFAULTS,
  clearPageSpaceOverrides,
  hasPageSpaceOverride,
  resolvePageSpacePreset,
  type PageSpaceOverrides,
  type PageSpacePreset,
  type PageSpaceScope,
} from '@/lib/page-space';
import { SkeletonBlock } from '../Skeleton';
import { useT } from '@/lib/i18n/client';
import { DEFAULT_HOME_LAYOUT, HOME_LAYOUT_EVENT, type HomeSectionId, type HomeSectionLayoutV1, type HomeSectionState } from '@/lib/home-section-layout';
import {
  VN_LAYOUT_EVENT,
  VN_SECTION_IDS,
  defaultVnDetailLayoutV1,
  type VnDetailLayoutV1,
  type VnSectionId,
  type VnSectionState,
} from '@/lib/vn-detail-layout';
import { CHARACTER_DETAIL_LAYOUT_EVENT, CHARACTER_SECTION_IDS, defaultCharacterDetailLayoutV1 } from '@/lib/character-detail-layout';
import { STAFF_DETAIL_LAYOUT_EVENT, STAFF_SECTION_IDS, defaultStaffDetailLayoutV1 } from '@/lib/staff-detail-layout';
import { PRODUCER_DETAIL_LAYOUT_EVENT, PRODUCER_SECTION_IDS, defaultProducerDetailLayoutV1 } from '@/lib/producer-detail-layout';
import { SERIES_DETAIL_LAYOUT_EVENT, SERIES_DETAIL_SECTION_IDS, defaultSeriesDetailLayoutV1 } from '@/lib/series-detail-layout';
import { useConfirm } from '../ConfirmDialog';
import type { SaveServer } from '../SettingsButton';
import type { ServerSettings } from '@/lib/settings-server-client-shape';

const PAGE_LAYOUT_TABS = ['home', 'vn', 'character', 'staff', 'producer', 'series'] as const;
type PageLayoutTab = typeof PAGE_LAYOUT_TABS[number];

/**
 * Body of the Settings → "VN page" (layout) tab. Owns every
 * `@dnd-kit` import in the Settings surface, so it is loaded via
 * `next/dynamic` from `SettingsButton` and the drag-and-drop bundle
 * only ships once the user opens this tab.
 */
export function LayoutSettingsTab({
  server,
  saveServer,
}: {
  server: ServerSettings | null;
  saveServer: SaveServer;
}) {
  const t = useT();
  const { settings, set } = useDisplaySettings();
  const [activePageLayoutTab, setActivePageLayoutTab] = useState<PageLayoutTab>('home');
  const [layoutSubTab, setLayoutSubTab] = useState<'perpage' | 'spacing' | 'sections'>('perpage');

  return (
    <div
      role="tabpanel"
      id="settings-panel-vn-page"
      aria-labelledby="settings-tab-vn-page"
      className="space-y-4"
    >
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-border bg-bg-elev/20 p-1">
        {(['perpage', 'spacing', 'sections'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setLayoutSubTab(tab)}
            className={`min-h-[44px] shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              layoutSubTab === tab
                ? 'bg-accent text-bg'
                : 'text-muted hover:text-white'
            }`}
          >
            {tab === 'perpage' ? t.settings.layoutSubTabPages : tab === 'spacing' ? t.settings.layoutSubTabSpacing : t.settings.layoutSubTabSections}
          </button>
        ))}
      </div>

      {layoutSubTab === 'spacing' && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elev/50 p-3">
          <span className="text-sm font-semibold">{t.settings.globalPageWidth}</span>
          <span className="text-[11px] text-muted">{t.settings.globalPageWidthHint}</span>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              aria-pressed={settings.globalPageSpace == null}
              onClick={() => set('globalPageSpace', null)}
              className={`min-h-[44px] rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                settings.globalPageSpace == null
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
              }`}
            >
              {t.settings.globalPageWidthOff}
            </button>
            {PAGE_SPACE_PRESET_IDS.map((preset) => {
              const active = settings.globalPageSpace === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set('globalPageSpace', preset)}
                  className={`min-h-[44px] rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
                  }`}
                >
                  {t.pageSpace.preset[preset]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {layoutSubTab === 'perpage' && <PerPageLayoutPanel />}

      {layoutSubTab === 'sections' && (
        <>
          <nav
            role="tablist"
            aria-label={t.settings.tabs['vn-page']}
            className="mb-4 inline-flex flex-wrap gap-1 rounded-md border border-border bg-bg-elev/30 p-1 text-xs"
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
              e.preventDefault();
              const idx = PAGE_LAYOUT_TABS.indexOf(activePageLayoutTab);
              let next: PageLayoutTab;
              if (e.key === 'Home') next = PAGE_LAYOUT_TABS[0];
              else if (e.key === 'End') next = PAGE_LAYOUT_TABS[PAGE_LAYOUT_TABS.length - 1];
              else if (e.key === 'ArrowRight') next = PAGE_LAYOUT_TABS[(idx + 1) % PAGE_LAYOUT_TABS.length];
              else next = PAGE_LAYOUT_TABS[(idx - 1 + PAGE_LAYOUT_TABS.length) % PAGE_LAYOUT_TABS.length];
              setActivePageLayoutTab(next);
              document.getElementById(`page-layout-tab-${next}`)?.focus();
            }}
          >
            {(
              [
                ['home', t.homeLayout.openEditor],
                ['vn', t.vnLayout.restoreTitle],
                ['character', t.characterLayout.restoreTitle],
                ['staff', t.staffLayout.restoreTitle],
                ['producer', t.producerLayout.restoreTitle],
                ['series', t.seriesLayout.restoreTitle],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                id={`page-layout-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={activePageLayoutTab === key}
                aria-controls={`page-layout-panel-${key}`}
                tabIndex={activePageLayoutTab === key ? 0 : -1}
                onClick={() => setActivePageLayoutTab(key)}
                className={`min-h-[44px] rounded px-2.5 py-1 sm:min-h-0 ${activePageLayoutTab === key ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </nav>
          {activePageLayoutTab === 'home' && (
            <div role="tabpanel" id="page-layout-panel-home" aria-labelledby="page-layout-tab-home">
              <HomeLayoutPanel
                layout={server?.home_section_layout_v1 ?? DEFAULT_HOME_LAYOUT}
                onChange={(next) => saveServer({ home_section_layout_v1: next })}
              />
            </div>
          )}
          {activePageLayoutTab === 'vn' && (
            <div role="tabpanel" id="page-layout-panel-vn" aria-labelledby="page-layout-tab-vn">
              <VnLayoutPanel
                layout={server?.vn_detail_section_layout_v1 ?? defaultVnDetailLayoutV1()}
                onSave={(next) => saveServer({ vn_detail_section_layout_v1: next })}
                onReset={() => saveServer({ vn_detail_section_layout_v1: null })}
              />
            </div>
          )}
          {activePageLayoutTab === 'character' && (
            <div role="tabpanel" id="page-layout-panel-character" aria-labelledby="page-layout-tab-character">
              <PageLayoutPanel
                title={t.characterLayout.restoreTitle}
                desc={t.characterLayout.restoreDesc}
                resetLabel={t.characterLayout.reset}
                layout={server?.character_detail_section_layout_v1 ?? defaultCharacterDetailLayoutV1()}
                sectionIds={CHARACTER_SECTION_IDS}
                sectionLabels={t.characterLayout.sectionLabels as Record<string, string>}
                eventName={CHARACTER_DETAIL_LAYOUT_EVENT}
                onSave={(next) => saveServer({ character_detail_section_layout_v1: next })}
                onReset={() => saveServer({ character_detail_section_layout_v1: null })}
              />
            </div>
          )}
          {activePageLayoutTab === 'staff' && (
            <div role="tabpanel" id="page-layout-panel-staff" aria-labelledby="page-layout-tab-staff">
              <PageLayoutPanel
                title={t.staffLayout.restoreTitle}
                desc={t.staffLayout.restoreDesc}
                resetLabel={t.staffLayout.reset}
                layout={server?.staff_detail_section_layout_v1 ?? defaultStaffDetailLayoutV1()}
                sectionIds={STAFF_SECTION_IDS}
                sectionLabels={t.staffLayout.sectionLabels as Record<string, string>}
                eventName={STAFF_DETAIL_LAYOUT_EVENT}
                onSave={(next) => saveServer({ staff_detail_section_layout_v1: next })}
                onReset={() => saveServer({ staff_detail_section_layout_v1: null })}
              />
            </div>
          )}
          {activePageLayoutTab === 'producer' && (
            <div role="tabpanel" id="page-layout-panel-producer" aria-labelledby="page-layout-tab-producer">
              <PageLayoutPanel
                title={t.producerLayout.restoreTitle}
                desc={t.producerLayout.restoreDesc}
                resetLabel={t.producerLayout.reset}
                layout={server?.producer_detail_section_layout_v1 ?? defaultProducerDetailLayoutV1()}
                sectionIds={PRODUCER_SECTION_IDS}
                sectionLabels={t.producerLayout.sectionLabels as Record<string, string>}
                eventName={PRODUCER_DETAIL_LAYOUT_EVENT}
                onSave={(next) => saveServer({ producer_detail_section_layout_v1: next })}
                onReset={() => saveServer({ producer_detail_section_layout_v1: null })}
              />
            </div>
          )}
          {activePageLayoutTab === 'series' && (
            <div role="tabpanel" id="page-layout-panel-series" aria-labelledby="page-layout-tab-series">
              <PageLayoutPanel
                title={t.seriesLayout.restoreTitle}
                desc={t.seriesLayout.restoreDesc}
                resetLabel={t.seriesLayout.reset}
                layout={server?.series_detail_section_layout_v1 ?? defaultSeriesDetailLayoutV1()}
                sectionIds={SERIES_DETAIL_SECTION_IDS}
                sectionLabels={t.seriesLayout.sectionLabels as Record<string, string>}
                eventName={SERIES_DETAIL_LAYOUT_EVENT}
                onSave={(next) => saveServer({ series_detail_section_layout_v1: next })}
                onReset={() => saveServer({ series_detail_section_layout_v1: null })}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Manage home-page section visibility from inside the Settings modal.
 * Mirrors the per-strip "..." menu but with a flat list so the user
 * from the home page the "..." menu is gone too).
 *
 * Each toggle issues an optimistic PATCH to /api/settings - same
 * envelope shape as the per-strip menu - and broadcasts a
 * `vn:home-layout-changed` event so live strips update without a
 * router.refresh().
 */
function HomeLayoutPanel({
  layout,
  onChange,
}: {
  layout: HomeSectionLayoutV1;
  onChange: (next: { sections?: Partial<HomeSectionLayoutV1['sections']>; order?: HomeSectionLayoutV1['order'] }) => Promise<boolean>;
}) {
  const t = useT();
  const [draft, setDraft] = useState(layout);
  const revisionRef = useRef(0);

  useEffect(() => {
    setDraft(layout);
  }, [layout]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function persist(
    nextDraft: HomeSectionLayoutV1,
    patch: { sections?: Partial<HomeSectionLayoutV1['sections']>; order?: HomeSectionLayoutV1['order'] },
    detail: { reset?: boolean; sections?: Partial<HomeSectionLayoutV1['sections']>; order?: HomeSectionLayoutV1['order'] },
  ) {
    const revision = ++revisionRef.current;
    setDraft(nextDraft);
    const saved = await onChange(patch);
    if (saved) {
      window.dispatchEvent(new CustomEvent(HOME_LAYOUT_EVENT, { detail }));
    } else if (revisionRef.current === revision) {
      setDraft(layout);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draft.order.indexOf(active.id as HomeSectionId);
    const newIndex = draft.order.indexOf(over.id as HomeSectionId);
    if (oldIndex < 0 || newIndex < 0) return;
    const nextOrder = arrayMove(draft.order, oldIndex, newIndex);
    void persist({ ...draft, order: nextOrder }, { order: nextOrder }, { order: nextOrder });
  }

  function toggleVisible(id: HomeSectionId) {
    const cur = draft.sections[id];
    const next: HomeSectionState = { ...cur, visible: !cur.visible };
    void persist(
      { ...draft, sections: { ...draft.sections, [id]: next } },
      { sections: { [id]: next } },
      { sections: { [id]: next } },
    );
  }

  const hiddenCount = draft.order.filter((id) => !draft.sections[id].visible).length;
  return (
    <div className="mt-6 border-t border-border pt-5">
      <h3 className="mb-1 text-sm font-bold">{t.homeSections.title}</h3>
      <p className="mb-3 text-[11px] text-muted">{t.homeSections.desc}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={draft.order} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {draft.order.map((id) => (
              <SortableHomeLayoutRow
                key={id}
                id={id}
                visible={draft.sections[id]?.visible !== false}
                label={t.homeSections.sectionLabels[id]}
                onToggleVisible={() => toggleVisible(id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {hiddenCount === 0 && (
        <p className="mt-2 text-[10px] text-muted">{t.homeSections.hiddenNoneHint}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-[10px] text-muted">{t.homeSections.resetHint}</p>
        <button
          type="button"
          onClick={() => {
            void persist(
              DEFAULT_HOME_LAYOUT,
              { sections: DEFAULT_HOME_LAYOUT.sections, order: DEFAULT_HOME_LAYOUT.order },
              { reset: true },
            );
          }}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/30 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent sm:min-h-0"
          title={t.homeSections.resetHint}
        >
          <Settings2 className="h-3 w-3" aria-hidden />
          {t.homeSections.reset}
        </button>
      </div>
    </div>
  );
}

function SortableHomeLayoutRow({
  id,
  visible,
  label,
  onToggleVisible,
}: {
  id: string;
  visible: boolean;
  label: string;
  onToggleVisible: () => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-bg-elev/40 px-2 py-1.5 text-xs"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t.homeLayout.dragHandle}
        className="tap-target-tight cursor-grab text-muted hover:text-white"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span className={`flex-1 ${visible ? 'text-white' : 'text-muted line-through'}`}>{label}</span>
      <button
        type="button"
        onClick={onToggleVisible}
        aria-pressed={!visible}
        className={`inline-flex min-h-[44px] items-center gap-1 rounded-md border px-2 py-1 text-[11px] sm:min-h-0 ${
          visible
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-border text-muted hover:border-accent hover:text-accent'
        }`}
      >
        {visible ? <Eye className="h-3 w-3" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
        {visible ? t.homeSections.show : t.homeSections.hide}
      </button>
    </li>
  );
}

/**
 * Manage VN-page section visibility / collapse defaults from the
 * Settings modal. Same shape as HomeLayoutPanel: a flat list of every
 * registered section with show/hide + collapsed-by-default toggles
 * and a "Reset to defaults" button. Saves the whole layout in one
 * PATCH so the user's reorder (done from the VN page itself) isn't
 * clobbered by toggling visibility here - we read the current order
 * back and write it whole.
 */
function VnLayoutPanel({
  layout,
  onSave,
  onReset,
}: {
  layout: VnDetailLayoutV1;
  onSave: (next: VnDetailLayoutV1) => Promise<boolean>;
  onReset: () => Promise<boolean>;
}) {
  const t = useT();
  const [draft, setDraft] = useState(layout);
  const revisionRef = useRef(0);

  useEffect(() => {
    setDraft(layout);
  }, [layout]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function persist(next: VnDetailLayoutV1) {
    const revision = ++revisionRef.current;
    setDraft(next);
    const saved = await onSave(next);
    if (saved) {
      window.dispatchEvent(new CustomEvent(VN_LAYOUT_EVENT, { detail: { layout: next } }));
    } else if (revisionRef.current === revision) {
      setDraft(layout);
    }
  }

  async function reset() {
    const revision = ++revisionRef.current;
    const saved = await onReset();
    if (saved) {
      const next = defaultVnDetailLayoutV1();
      setDraft(next);
      window.dispatchEvent(new CustomEvent(VN_LAYOUT_EVENT, { detail: { layout: next } }));
    } else if (revisionRef.current === revision) {
      setDraft(layout);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draft.order.indexOf(active.id as VnSectionId);
    const newIndex = draft.order.indexOf(over.id as VnSectionId);
    if (oldIndex < 0 || newIndex < 0) return;
    const nextOrder = arrayMove(draft.order, oldIndex, newIndex);
    void persist({ ...draft, order: nextOrder });
  }

  function patch(id: VnSectionId, partial: Partial<VnSectionState>) {
    void persist({
      order: draft.order,
      sections: { ...draft.sections, [id]: { ...draft.sections[id], ...partial } },
    });
  }

  const hiddenCount = VN_SECTION_IDS.filter((id) => !draft.sections[id].visible).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="mb-1 text-sm font-bold">{t.vnLayout.restoreTitle}</h3>
          <p className="text-[11px] text-muted">{t.vnLayout.restoreDesc}</p>
        </div>
        <button
          type="button"
          onClick={() => void reset()}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-on_hold hover:text-status-on_hold sm:min-h-0"
        >
          {t.vnLayout.reset}
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={draft.order} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {draft.order.map((id) => (
              <SortableDetailRow
                key={id}
                id={id}
                visible={draft.sections[id]?.visible !== false}
                collapsedByDefault={draft.sections[id]?.collapsedByDefault ?? false}
                label={t.vnLayout.sectionLabels[id]}
                collapseLabel={t.vnLayout.collapseByDefault}
                showLabel={t.vnLayout.show}
                hideLabel={t.vnLayout.hide}
                dragHandleLabel={t.homeLayout.dragHandle}
                onToggleVisible={() => patch(id, { visible: !draft.sections[id].visible })}
                onToggleCollapse={(v) => patch(id, { collapsedByDefault: v })}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {hiddenCount === 0 && (
        <p className="text-[10px] text-muted">{t.vnLayout.hiddenNoneHint}</p>
      )}
    </div>
  );
}

/**
 * Generic collapsed-by-default accordion panel for any detail-page
 * section layout (character, staff, producer, series). Same contract
 * as VnLayoutPanel but parameterised - avoids copy-pasting.
 */
function PageLayoutPanel<Id extends string>({
  title,
  desc,
  resetLabel,
  layout,
  sectionIds,
  sectionLabels,
  eventName,
  onSave,
  onReset,
}: {
  title: string;
  desc: string;
  resetLabel: string;
  layout: { order: Id[]; sections: Record<Id, { visible: boolean; collapsedByDefault: boolean }> };
  sectionIds: readonly Id[];
  sectionLabels: Record<string, string>;
  eventName: string;
  onSave: (next: typeof layout) => Promise<boolean>;
  onReset: () => Promise<boolean>;
}) {
  const t = useT();
  const panelId = useId();
  const [draft, setDraft] = useState(layout);
  const [open, setOpen] = useState(true);
  const revisionRef = useRef(0);

  useEffect(() => { setDraft(layout); }, [layout]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function persist(next: typeof layout) {
    const revision = ++revisionRef.current;
    setDraft(next);
    const saved = await onSave(next);
    if (saved) {
      window.dispatchEvent(new CustomEvent(eventName, { detail: { layout: next } }));
    } else if (revisionRef.current === revision) {
      setDraft(layout);
    }
  }

  async function reset() {
    const revision = ++revisionRef.current;
    const saved = await onReset();
    if (!saved && revisionRef.current === revision) setDraft(layout);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draft.order.indexOf(active.id as Id);
    const newIndex = draft.order.indexOf(over.id as Id);
    if (oldIndex < 0 || newIndex < 0) return;
    const nextOrder = arrayMove(draft.order, oldIndex, newIndex);
    void persist({ ...draft, order: nextOrder });
  }

  function patch(id: Id, partial: Partial<{ visible: boolean; collapsedByDefault: boolean }>) {
    void persist({
      order: draft.order,
      sections: { ...draft.sections, [id]: { ...draft.sections[id], ...partial } },
    });
  }

  const hiddenCount = sectionIds.filter((id) => !draft.sections[id]?.visible).length;

  return (
    <div className="border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left sm:min-h-0"
      >
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="text-[11px] text-muted">{desc}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hiddenCount > 0 && (
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">{hiddenCount}</span>
          )}
          {open
            ? <ChevronUp className="h-3.5 w-3.5 text-muted" aria-hidden />
            : <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
          }
        </div>
      </button>
      {open && (
        <div id={panelId} className="mt-3 space-y-2">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void reset()}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-on_hold hover:text-status-on_hold sm:min-h-0"
            >
              {resetLabel}
            </button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={draft.order} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {draft.order.map((id) => {
                  if (!draft.sections[id]) return null;
                  return (
                    <SortableDetailRow
                      key={id}
                      id={id}
                      visible={draft.sections[id]?.visible !== false}
                      collapsedByDefault={draft.sections[id]?.collapsedByDefault ?? false}
                      label={sectionLabels[id] ?? id}
                      collapseLabel={t.vnLayout.collapseByDefault}
                      showLabel={t.vnLayout.show}
                      hideLabel={t.vnLayout.hide}
                      dragHandleLabel={t.homeLayout.dragHandle}
                      onToggleVisible={() => patch(id, { visible: !draft.sections[id].visible })}
                      onToggleCollapse={(v) => patch(id, { collapsedByDefault: v })}
                    />
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

function SortableDetailRow({
  id,
  visible,
  collapsedByDefault,
  label,
  collapseLabel,
  showLabel,
  hideLabel,
  dragHandleLabel,
  onToggleVisible,
  onToggleCollapse,
}: {
  id: string;
  visible: boolean;
  collapsedByDefault: boolean;
  label: string;
  collapseLabel: string;
  showLabel: string;
  hideLabel: string;
  dragHandleLabel: string;
  onToggleVisible: () => void;
  onToggleCollapse: (v: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-bg-elev/40 px-2 py-1.5 text-xs"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={dragHandleLabel}
        className="tap-target-tight cursor-grab text-muted hover:text-white"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span className={`flex-1 ${visible ? 'text-white' : 'text-muted line-through'}`}>{label}</span>
      <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 text-[10px] text-muted sm:min-h-0">
        <input
          type="checkbox"
          checked={collapsedByDefault}
          onChange={(e) => onToggleCollapse(e.target.checked)}
          className="h-3 w-3 accent-accent"
        />
        {collapseLabel}
      </label>
      <button
        type="button"
        onClick={onToggleVisible}
        aria-pressed={!visible}
        className={`inline-flex min-h-[44px] items-center gap-1 rounded-md border px-2 py-1 text-[11px] sm:min-h-0 ${
          visible
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-border text-muted hover:border-accent hover:text-accent'
        }`}
      >
        {visible ? <Eye className="h-3 w-3" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
        {visible ? hideLabel : showLabel}
      </button>
    </li>
  );
}

const PAGE_LAYOUT_DENSITY_SCOPES: Partial<Record<PageSpaceScope, readonly DensityScope[]>> = {
  library: ['library'],
  wishlist: ['wishlist'],
  search: ['search'],
  vn: ['vnMedia'],
  staff: ['staffWorks'],
  character: ['characterWorks'],
  producer: ['producerWorks'],
  series: ['seriesWorks'],
  lists: ['lists'],
  shelf: ['shelf'],
  recommendations: ['recommendations'],
  topRanked: ['topRanked'],
  upcoming: ['upcoming'],
  similar: ['vnSimilar'],
  tags: ['tagPage'],
  dumped: ['dumped'],
  egs: ['egs'],
};

/**
 * Settings → Display panel for per-page layout overrides. It combines
 * page spacing and scoped card-density state in one row per route
 * group, so Display no longer has two competing "per-page" panels.
 *
 * @returns Settings block for route-group layout overrides.
 */
function PerPageLayoutPanel() {
  const t = useT();
  const { settings, set } = useDisplaySettings();
  const { confirm } = useConfirm();
  const [hydrated, setHydrated] = useState(false);
  const pageSpace = settings.pageSpace ?? {};
  const density = settings.density ?? {};

  useEffect(() => {
    setHydrated(true);
  }, []);

  function setScopePreset(scope: PageSpaceScope, preset: PageSpacePreset) {
    const next: PageSpaceOverrides = { ...pageSpace };
    if (preset === PAGE_SPACE_SCOPE_DEFAULTS[scope]) delete next[scope];
    else next[scope] = preset;
    set('pageSpace', next);
  }

  function resetSpaceScope(scope: PageSpaceScope) {
    const next: PageSpaceOverrides = { ...pageSpace };
    delete next[scope];
    set('pageSpace', next);
  }

  function setScopeDensity(scope: DensityScope, px: number) {
    set('density', { ...density, [scope]: clampCardDensity(px) });
  }

  function resetDensityScope(scope: DensityScope) {
    const next: DensityScopes = { ...density };
    delete next[scope];
    set('density', next);
  }

  function resetAllDensityScopes() {
    set('density', clearAllScopeDensities(settings));
  }

  function resetAllSpaceScopes() {
    set('pageSpace', clearPageSpaceOverrides());
  }

  function resetEverything() {
    set('pageSpace', clearPageSpaceOverrides());
    set('density', clearAllScopeDensities(settings));
    set('cardDensityPx', CARD_DENSITY_DEFAULT);
  }

  const someSpaceOverride = PAGE_SPACE_SCOPES.some((scope) => hasPageSpaceOverride(settings, scope));
  const someDensityOverride = DENSITY_SCOPES.some((scope) => hasScopeOverride(settings, scope));

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elev/50 p-3" aria-busy="true">
        <SkeletonBlock className="h-4 w-44" />
        <SkeletonBlock className="h-3 w-72" />
        <div className="mt-1 grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elev/50 p-3">
      <span className="text-sm font-semibold">{t.settings.perPageLayout}</span>
      <span className="text-[11px] text-muted">{t.settings.perPageLayoutHint}</span>
      <ul className="mt-1 grid gap-2">
        {PAGE_SPACE_SCOPES.map((scope) => {
          const activePreset = resolvePageSpacePreset(settings, scope);
          const spaceOverridden = hasPageSpaceOverride(settings, scope);
          const densityScopes = PAGE_LAYOUT_DENSITY_SCOPES[scope] ?? [];
          return (
            <li
              key={scope}
              className="grid gap-2 rounded-md border border-border/60 bg-bg-card/40 px-2 py-2 text-[11px] xl:grid-cols-[minmax(8rem,0.7fr)_minmax(20rem,1.3fr)_minmax(20rem,1fr)]"
            >
              <div className="min-w-0">
                <span className={spaceOverridden ? 'block text-white' : 'block text-muted'}>
                  {t.pageSpace.scope[scope]}
                </span>
                <span className="block text-[10px] text-muted/80">
                  {spaceOverridden
                    ? t.pageSpace.customOverride
                    : t.pageSpace.defaultPreset.replace(
                        '{preset}',
                        t.pageSpace.preset[PAGE_SPACE_SCOPE_DEFAULTS[scope]],
                      )}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {PAGE_SPACE_PRESET_IDS.map((preset) => {
                  const active = preset === activePreset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setScopePreset(scope, preset)}
                      className={`min-h-[44px] rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                        active
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
                      }`}
                    >
                      {active && <Check className="mr-1 inline h-3 w-3" aria-hidden />}
                      {t.pageSpace.preset[preset]}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => resetSpaceScope(scope)}
                  disabled={!spaceOverridden}
                  className="min-h-[44px] rounded-md border border-border bg-bg-elev/40 px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted"
                  title={t.settings.pageSpaceReset}
                >
                  {t.settings.pageSpaceReset}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1 xl:justify-end">
                {densityScopes.length > 0 ? (
                  densityScopes.map((densityScope) => {
                    const overridden = hasScopeOverride(settings, densityScope);
                    const resolved = resolveScopedDensity(settings, densityScope, null);
                    return (
                      <span
                        key={densityScope}
                        className={`grid w-full max-w-[20rem] grid-cols-[44px_minmax(4rem,1fr)_44px_2.5rem_44px] items-center gap-1 rounded-md border px-2 py-1 ${
                          overridden ? 'border-accent/40 bg-accent/5' : 'border-border bg-bg-elev/40'
                        }`}
                        title={overridden ? t.settings.densityReset : t.settings.followsDefault}
                      >
                        <button
                          type="button"
                          onClick={() => setScopeDensity(densityScope, resolved - 20)}
                          aria-label={t.cardDensity.denser}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:text-accent"
                        >
                          <Minimize2 className="h-3 w-3" aria-hidden />
                        </button>
                        <input
                          type="range"
                          min={CARD_DENSITY_MIN}
                          max={CARD_DENSITY_MAX}
                          step={10}
                          value={resolved}
                          onChange={(e) => setScopeDensity(densityScope, Number(e.target.value))}
                          aria-label={t.cardDensity.label}
                          className="h-1.5 min-w-0 w-full cursor-pointer accent-accent"
                        />
                        <button
                          type="button"
                          onClick={() => setScopeDensity(densityScope, resolved + 20)}
                          aria-label={t.cardDensity.larger}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:text-accent"
                        >
                          <Maximize2 className="h-3 w-3" aria-hidden />
                        </button>
                        <span className={`w-9 text-right text-[10px] tabular-nums ${overridden ? 'text-accent' : 'text-muted/80'}`}>
                          {resolved}px
                        </span>
                        <button
                          type="button"
                          onClick={() => resetDensityScope(densityScope)}
                          disabled={!overridden}
                          aria-label={t.settings.densityReset}
                          title={t.settings.densityReset}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-muted"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    );
                  })
                ) : (
                  <span className="text-[10px] italic text-muted/70">{t.settings.noDensityControl}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
        <button
          type="button"
          onClick={resetAllSpaceScopes}
          disabled={!someSpaceOverride}
          className="min-h-[44px] rounded-md border border-border bg-bg-elev/40 px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted"
        >
          {t.settings.pageSpaceResetAll}
        </button>
        <button
          type="button"
          onClick={resetAllDensityScopes}
          disabled={!someDensityOverride}
          className="min-h-[44px] rounded-md border border-border bg-bg-elev/40 px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted"
        >
          {t.settings.perPageResetAll}
        </button>
        <button
          type="button"
          onClick={async () => {
            const ok = await confirm({
              message: t.settings.resetEverythingConfirm,
              tone: 'danger',
            });
            if (ok) resetEverything();
          }}
          className="min-h-[44px] rounded-md border border-border bg-bg-elev/40 px-3 py-1 text-xs text-muted hover:border-status-dropped hover:text-status-dropped"
        >
          {t.settings.resetEverything}
        </button>
      </div>
    </div>
  );
}
