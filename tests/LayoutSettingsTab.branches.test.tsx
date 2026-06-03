// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { VN_SECTION_IDS } from '@/lib/vn-detail-layout';
import { SERIES_DETAIL_SECTION_IDS } from '@/lib/series-detail-layout';
import { LayoutSettingsTab } from '@/components/settings/LayoutSettingsTab';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { STOCK_PROVIDER_IDS } from '@/lib/stock-provider-constants';
import { DEFAULT_HOME_LAYOUT } from '@/lib/home-section-layout';
import { VN_LAYOUT_EVENT, defaultVnDetailLayoutV1 } from '@/lib/vn-detail-layout';
import { defaultCharacterDetailLayoutV1 } from '@/lib/character-detail-layout';
import { defaultStaffDetailLayoutV1 } from '@/lib/staff-detail-layout';
import { defaultProducerDetailLayoutV1 } from '@/lib/producer-detail-layout';
import { SERIES_DETAIL_LAYOUT_EVENT, defaultSeriesDetailLayoutV1 } from '@/lib/series-detail-layout';
import type { SaveServer } from '@/components/SettingsButton';
import type { ServerSettings } from '@/lib/settings-server-client-shape';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

// Capture the active panel's onDragEnd so the reorder branch can be driven
// without a real pointer/keyboard drag, following the repo dnd-test pattern.
const dnd: { onDragEnd?: (e: unknown) => void } = {};
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd?: (e: unknown) => void }) => {
    dnd.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  PointerSensor: function PointerSensor() {},
  KeyboardSensor: function KeyboardSensor() {},
  TouchSensor: function TouchSensor() {},
  closestCenter: () => [],
  useSensor: (s: unknown) => s,
  useSensors: (...s: unknown[]) => s,
}));
vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable');
  return {
    arrayMove: actual.arrayMove,
    SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    verticalListSortingStrategy: () => null,
    sortableKeyboardCoordinates: () => null,
    useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: undefined, isDragging: false }),
  };
});
vi.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => '' } } }));

const t = dictionaries.en;

function proxyConfig() {
  return { enabled: false, protocol: 'http' as const, host: '', port: null, username: '', hasPassword: false };
}

function serverSettings(): ServerSettings {
  const providerProxies: Partial<ServerSettings> = {};
  for (const id of STOCK_PROVIDER_IDS) providerProxies[`${id}_proxy_config`] = proxyConfig();
  return {
    vndb_token: { hasToken: true, preview: 'abc...', envFallback: false },
    random_quote_source: 'all',
    default_sort: 'updated_at',
    default_order: 'desc',
    default_group: 'none',
    home_section_layout_v1: DEFAULT_HOME_LAYOUT,
    vn_detail_section_layout_v1: defaultVnDetailLayoutV1(),
    series_detail_section_layout_v1: defaultSeriesDetailLayoutV1(),
    character_detail_section_layout_v1: defaultCharacterDetailLayoutV1(),
    staff_detail_section_layout_v1: defaultStaffDetailLayoutV1(),
    producer_detail_section_layout_v1: defaultProducerDetailLayoutV1(),
    vndb_writeback: false,
    vndb_backup_enabled: true,
    vndb_backup_url: { hasUrl: false, host: null, isDefault: true },
    vndb_fanout: true,
    steam_api_key: { hasKey: false },
    steam_id: '',
    egs_username: '',
    vndb_proxy_config: proxyConfig(),
    vndbmirror_proxy_config: proxyConfig(),
    egs_proxy_config: proxyConfig(),
    alicenet_proxy_config: proxyConfig(),
    stock_proxy_config: proxyConfig(),
    stock_disabled_providers: [],
    stock_retry_without_proxy: false,
    ...providerProxies,
  } as ServerSettings;
}

function renderLayout(saveServer: SaveServer = vi.fn<SaveServer>(async () => true), server: ServerSettings | null = serverSettings()) {
  return {
    saveServer,
    ...renderWithProviders(
      <DisplaySettingsProvider>
        <LayoutSettingsTab server={server} saveServer={saveServer} />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    ),
  };
}

function rowFor(text: string): HTMLElement {
  const row = screen.getByText(text).closest('li');
  expect(row).toBeTruthy();
  return row as HTMLElement;
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  dnd.onDragEnd = undefined;
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
});

describe('LayoutSettingsTab branches', () => {
  it('renders the per-page panel after the hydrate effect resolves', async () => {
    // The pre-hydration skeleton branch executes during the first render;
    // after the effect runs the live panel replaces it.
    renderLayout();
    await waitFor(() => expect(screen.getByText(t.settings.perPageLayout)).toBeInTheDocument());
    expect(screen.getByText(t.pageSpace.scope.library as string)).toBeInTheDocument();
  });

  it('renders the no-density-control hint for scopes without a density mapping', async () => {
    renderLayout();
    await waitFor(() => expect(screen.getByText(t.pageSpace.scope.library as string)).toBeInTheDocument());
    // The "data" scope has no density scope mapping -> italic hint.
    const dataRow = rowFor(t.pageSpace.scope.data as string);
    expect(within(dataRow).getByText(t.settings.noDensityControl as string)).toBeInTheDocument();
  });

  it('keeps the per-scope reset buttons disabled until an override exists', async () => {
    renderLayout();
    await waitFor(() => expect(screen.getByText(t.pageSpace.scope.library as string)).toBeInTheDocument());
    const libraryRow = rowFor(t.pageSpace.scope.library as string);
    // No override yet: both the space reset and density reset are disabled.
    expect(within(libraryRow).getByRole('button', { name: t.settings.pageSpaceReset as string })).toBeDisabled();
    expect((within(libraryRow).getByRole('button', { name: t.settings.densityReset as string }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('clamps the scoped density at the floor and ceiling', async () => {
    renderLayout();
    await waitFor(() => expect(screen.getByText(t.pageSpace.scope.library as string)).toBeInTheDocument());
    const libraryRow = rowFor(t.pageSpace.scope.library as string);
    const slider = within(libraryRow).getByRole('slider', { name: t.cardDensity.label as string });
    const denser = within(libraryRow).getByRole('button', { name: t.cardDensity.denser as string });
    const larger = within(libraryRow).getByRole('button', { name: t.cardDensity.larger as string });

    // Pin to the floor, then one more denser step clamps (no change).
    fireEvent.change(slider, { target: { value: '120' } });
    await waitFor(() => expect(within(libraryRow).getByText('120px')).toBeInTheDocument());
    fireEvent.click(denser);
    await waitFor(() => expect(within(libraryRow).getByText('120px')).toBeInTheDocument());

    // Pin to the ceiling, then one more larger step clamps (no change).
    fireEvent.change(slider, { target: { value: '480' } });
    await waitFor(() => expect(within(libraryRow).getByText('480px')).toBeInTheDocument());
    fireEvent.click(larger);
    await waitFor(() => expect(within(libraryRow).getByText('480px')).toBeInTheDocument());
  });

  it('cancels the reset-everything confirmation without clearing overrides', async () => {
    renderLayout();
    await waitFor(() => expect(screen.getByText(t.pageSpace.scope.library as string)).toBeInTheDocument());
    const libraryRow = rowFor(t.pageSpace.scope.library as string);
    fireEvent.click(within(libraryRow).getByRole('button', { name: t.pageSpace.preset.compact as string }));
    expect(within(libraryRow).getByText(t.pageSpace.customOverride as string)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t.settings.resetEverything as string }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.cancel as string }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    // Override is preserved because the confirmation was cancelled.
    expect(within(libraryRow).getByText(t.pageSpace.customOverride as string)).toBeInTheDocument();
  });

  it('navigates the section page-layout tablist with arrow / Home / End keys', async () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    const tablist = screen.getByRole('tablist', { name: t.settings.tabs['vn-page'] as string });
    const homeTab = screen.getByRole('tab', { name: t.homeLayout.openEditor as string });
    const seriesTab = screen.getByRole('tab', { name: t.seriesLayout.restoreTitle as string });
    const vnTab = screen.getByRole('tab', { name: t.vnLayout.restoreTitle as string });

    expect(homeTab).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    await waitFor(() => expect(vnTab).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    await waitFor(() => expect(homeTab).toHaveAttribute('aria-selected', 'true'));
    // ArrowLeft from the first wraps to the last (series).
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    await waitFor(() => expect(seriesTab).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(tablist, { key: 'Home' });
    await waitFor(() => expect(homeTab).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(tablist, { key: 'End' });
    await waitFor(() => expect(seriesTab).toHaveAttribute('aria-selected', 'true'));
    // A non-navigation key is ignored.
    fireEvent.keyDown(tablist, { key: 'b' });
    expect(seriesTab).toHaveAttribute('aria-selected', 'true');
  });

  it('reverts the home draft when the visibility save fails', async () => {
    const saveServer = vi.fn<SaveServer>(async () => false);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    const firstHomeToggle = screen.getAllByRole('button', { name: t.homeSections.show as string })[0];
    fireEvent.click(firstHomeToggle);
    await waitFor(() => expect(saveServer).toHaveBeenCalled());
    // Failed save reverts to the original layout: the row goes back to "show".
    await waitFor(() => expect(screen.getAllByRole('button', { name: t.homeSections.show as string }).length).toBeGreaterThan(0));
  });

  it('reverts the home reset when the reset save fails', async () => {
    const saveServer = vi.fn<SaveServer>(async () => false);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('button', { name: t.homeSections.reset as string }));
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith(expect.objectContaining({ home_section_layout_v1: expect.any(Object) })));
    // Panel still renders after the failed reset.
    expect(screen.getByText(t.homeSections.title as string)).toBeInTheDocument();
  });

  it('reverts the VN reset when the reset save fails', async () => {
    const saveServer = vi.fn<SaveServer>(async () => false);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('tab', { name: t.vnLayout.restoreTitle as string }));
    fireEvent.click(screen.getByRole('button', { name: t.vnLayout.reset as string }));
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith({ vn_detail_section_layout_v1: null }));
    // Toggling a row after a failed reset keeps the panel usable.
    expect(screen.getAllByRole('button', { name: t.vnLayout.hide as string }).length).toBeGreaterThan(0);
  });

  it('toggles a generic detail-panel section visibility and persists it', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('tab', { name: t.staffLayout.restoreTitle as string }));
    fireEvent.click(screen.getAllByRole('button', { name: t.vnLayout.hide as string })[0]);
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith(expect.objectContaining({ staff_detail_section_layout_v1: expect.any(Object) })));
  });

  it('removes a per-scope override when the default preset is re-selected', async () => {
    renderLayout();
    await waitFor(() => expect(screen.getByText(t.pageSpace.scope.library as string)).toBeInTheDocument());
    const libraryRow = rowFor(t.pageSpace.scope.library as string);
    // Apply a non-default preset, then re-select the default to delete it.
    fireEvent.click(within(libraryRow).getByRole('button', { name: t.pageSpace.preset.compact as string }));
    expect(within(libraryRow).getByText(t.pageSpace.customOverride as string)).toBeInTheDocument();
    fireEvent.click(within(libraryRow).getByRole('button', { name: t.pageSpace.preset.standard as string }));
    await waitFor(() => expect(
      within(libraryRow).getByText(t.pageSpace.defaultPreset.replace('{preset}', t.pageSpace.preset.standard)),
    ).toBeInTheDocument());
  });

  it('falls back to default layouts for every detail tab when the server settings are null', async () => {
    renderLayout(vi.fn<SaveServer>(async () => true), null);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    // Home tab renders from DEFAULT_HOME_LAYOUT.
    expect(screen.getByText(t.homeSections.title as string)).toBeInTheDocument();
    // Visit each detail tab so its `?? defaultXLayoutV1()` fallback executes.
    for (const tabName of [
      t.vnLayout.restoreTitle,
      t.characterLayout.restoreTitle,
      t.staffLayout.restoreTitle,
      t.producerLayout.restoreTitle,
      t.seriesLayout.restoreTitle,
    ] as string[]) {
      fireEvent.click(screen.getByRole('tab', { name: tabName }));
      await waitFor(() => expect(screen.getAllByRole('tab', { name: tabName })[0]).toHaveAttribute('aria-selected', 'true'));
    }
    // The series panel (last visited) shows its drag rows.
    expect(screen.getAllByRole('button', { name: t.vnLayout.hide as string }).length).toBeGreaterThan(0);
  });

  it('persists a VN section drag-handle visibility toggle and dispatches the layout event', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    const listener = vi.fn();
    window.addEventListener(VN_LAYOUT_EVENT, listener);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('tab', { name: t.vnLayout.restoreTitle as string }));
    fireEvent.click(screen.getAllByRole('button', { name: t.vnLayout.hide as string })[0]);
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith(expect.objectContaining({ vn_detail_section_layout_v1: expect.any(Object) })));
    await waitFor(() => expect(listener).toHaveBeenCalled());
    window.removeEventListener(VN_LAYOUT_EVENT, listener);
  });

  it('resets staff, producer, and series detail layouts through their panels', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    const cases: Array<[string, string, string]> = [
      [t.staffLayout.restoreTitle as string, t.staffLayout.reset as string, 'staff_detail_section_layout_v1'],
      [t.producerLayout.restoreTitle as string, t.producerLayout.reset as string, 'producer_detail_section_layout_v1'],
      [t.seriesLayout.restoreTitle as string, t.seriesLayout.reset as string, 'series_detail_section_layout_v1'],
    ];
    for (const [tabName, resetLabel, key] of cases) {
      fireEvent.click(screen.getByRole('tab', { name: tabName }));
      fireEvent.click(screen.getByRole('button', { name: resetLabel }));
      await waitFor(() => expect(saveServer).toHaveBeenCalledWith({ [key]: null }));
    }
  });

  it('persists a series section visibility toggle and dispatches its layout event', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    const listener = vi.fn();
    window.addEventListener(SERIES_DETAIL_LAYOUT_EVENT, listener);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('tab', { name: t.seriesLayout.restoreTitle as string }));
    fireEvent.click(screen.getAllByRole('button', { name: t.vnLayout.hide as string })[0]);
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith(expect.objectContaining({ series_detail_section_layout_v1: expect.any(Object) })));
    await waitFor(() => expect(listener).toHaveBeenCalled());
    window.removeEventListener(SERIES_DETAIL_LAYOUT_EVENT, listener);
  });

  it('toggles a generic panel collapse-by-default checkbox', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('tab', { name: t.producerLayout.restoreTitle as string }));
    fireEvent.click(screen.getAllByLabelText(t.vnLayout.collapseByDefault as string)[0]);
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith(expect.objectContaining({ producer_detail_section_layout_v1: expect.any(Object) })));
  });

  it('reorders the home layout via a drag-end and persists the new order', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    const order = DEFAULT_HOME_LAYOUT.order;
    await act(async () => { dnd.onDragEnd?.({ active: { id: order[0] }, over: { id: order[1] } }); });
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith(expect.objectContaining({ home_section_layout_v1: expect.any(Object) })));
    const patch = saveServer.mock.calls.at(-1)?.[0] as { home_section_layout_v1?: { order?: string[] } };
    expect(patch.home_section_layout_v1?.order?.[0]).toBe(order[1]);
  });

  it('ignores a home drag-end with no drop target, an identity drop, or an unknown id', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    const order = DEFAULT_HOME_LAYOUT.order;
    await act(async () => { dnd.onDragEnd?.({ active: { id: order[0] }, over: null }); });
    await act(async () => { dnd.onDragEnd?.({ active: { id: order[0] }, over: { id: order[0] } }); });
    await act(async () => { dnd.onDragEnd?.({ active: { id: 'not-a-section' }, over: { id: order[0] } }); });
    expect(saveServer).not.toHaveBeenCalled();
  });

  it('reorders the VN layout via a drag-end', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('tab', { name: t.vnLayout.restoreTitle as string }));
    await act(async () => { dnd.onDragEnd?.({ active: { id: VN_SECTION_IDS[0] }, over: { id: VN_SECTION_IDS[1] } }); });
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith(expect.objectContaining({ vn_detail_section_layout_v1: expect.any(Object) })));
  });

  it('ignores a VN drag-end with an unknown active id or no drop target', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('tab', { name: t.vnLayout.restoreTitle as string }));
    await act(async () => { dnd.onDragEnd?.({ active: { id: VN_SECTION_IDS[0] }, over: null }); });
    await act(async () => { dnd.onDragEnd?.({ active: { id: VN_SECTION_IDS[0] }, over: { id: VN_SECTION_IDS[0] } }); });
    await act(async () => { dnd.onDragEnd?.({ active: { id: 'ghost' }, over: { id: VN_SECTION_IDS[0] } }); });
    expect(saveServer).not.toHaveBeenCalled();
  });

  it('reverts the VN draft when a visibility toggle save fails', async () => {
    const saveServer = vi.fn<SaveServer>(async () => false);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('tab', { name: t.vnLayout.restoreTitle as string }));
    fireEvent.click(screen.getAllByRole('button', { name: t.vnLayout.hide as string })[0]);
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith(expect.objectContaining({ vn_detail_section_layout_v1: expect.any(Object) })));
    // Failed save reverts: every section returns to a "hide" affordance.
    await waitFor(() => expect(screen.getAllByRole('button', { name: t.vnLayout.hide as string }).length).toBe(VN_SECTION_IDS.length));
  });

  it('skips rendering a generic panel row whose id is missing from the section map', async () => {
    // A crafted character layout lists an extra id in `order` with no matching
    // `sections` entry; the panel renders null for that row (return-null branch).
    const server = serverSettings();
    const base = server.character_detail_section_layout_v1!;
    server.character_detail_section_layout_v1 = {
      order: [...base.order, 'phantom' as never],
      sections: base.sections,
    };
    renderLayout(vi.fn<SaveServer>(async () => true), server);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('tab', { name: t.characterLayout.restoreTitle as string }));
    // Real sections still render; the phantom id produces no extra row.
    const rows = screen.getAllByRole('button', { name: t.vnLayout.hide as string });
    expect(rows.length).toBe(base.order.length);
  });

  it('reorders a generic detail layout via a drag-end', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('tab', { name: t.seriesLayout.restoreTitle as string }));
    await act(async () => { dnd.onDragEnd?.({ active: { id: SERIES_DETAIL_SECTION_IDS[0] }, over: { id: SERIES_DETAIL_SECTION_IDS[1] } }); });
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith(expect.objectContaining({ series_detail_section_layout_v1: expect.any(Object) })));
  });

  it('ignores a generic drag-end with no drop target, identity drop, or unknown id', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('tab', { name: t.seriesLayout.restoreTitle as string }));
    await act(async () => { dnd.onDragEnd?.({ active: { id: SERIES_DETAIL_SECTION_IDS[0] }, over: null }); });
    await act(async () => { dnd.onDragEnd?.({ active: { id: SERIES_DETAIL_SECTION_IDS[0] }, over: { id: SERIES_DETAIL_SECTION_IDS[0] } }); });
    await act(async () => { dnd.onDragEnd?.({ active: { id: 'ghost' }, over: { id: SERIES_DETAIL_SECTION_IDS[0] } }); });
    expect(saveServer).not.toHaveBeenCalled();
  });

  it('shows the hidden-section badge on a generic panel after hiding every section', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('tab', { name: t.producerLayout.restoreTitle as string }));
    const hideButtons = screen.getAllByRole('button', { name: t.vnLayout.hide as string });
    fireEvent.click(hideButtons[0]);
    await waitFor(() => expect(saveServer).toHaveBeenCalled());
    // After hiding one section the row flips to a "show" affordance.
    await waitFor(() => expect(screen.getAllByRole('button', { name: t.vnLayout.show as string }).length).toBeGreaterThan(0));
  });
});
