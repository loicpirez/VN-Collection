// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { LayoutSettingsTab } from '@/components/settings/LayoutSettingsTab';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';
import { STOCK_PROVIDER_IDS } from '@/lib/stock-provider-constants';
import { DEFAULT_HOME_LAYOUT, HOME_LAYOUT_EVENT } from '@/lib/home-section-layout';
import { VN_LAYOUT_EVENT, defaultVnDetailLayoutV1 } from '@/lib/vn-detail-layout';
import { defaultCharacterDetailLayoutV1 } from '@/lib/character-detail-layout';
import { defaultStaffDetailLayoutV1 } from '@/lib/staff-detail-layout';
import { defaultProducerDetailLayoutV1 } from '@/lib/producer-detail-layout';
import { defaultSeriesDetailLayoutV1 } from '@/lib/series-detail-layout';
import type { SaveServer } from '@/components/SettingsButton';
import type { ServerSettings } from '@/lib/settings-server-client-shape';

const t = dictionaries[DEFAULT_LOCALE];

function proxyConfig() {
  return {
    enabled: false,
    protocol: 'http' as const,
    host: '',
    port: null,
    username: '',
    hasPassword: false,
  };
}

function serverSettings(): ServerSettings {
  const providerProxies: Partial<ServerSettings> = {};
  for (const id of STOCK_PROVIDER_IDS) {
    providerProxies[`${id}_proxy_config`] = proxyConfig();
  }
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
    vndb_backup_url: { hasUrl: true, host: 'api.example.test', isDefault: false },
    vndb_fanout: true,
    steam_api_key: { hasKey: true, preview: 'steam...' },
    steam_id: '123',
    egs_username: 'egs-user',
    vndb_proxy_config: proxyConfig(),
    vndbmirror_proxy_config: proxyConfig(),
    egs_proxy_config: proxyConfig(),
    stock_proxy_config: proxyConfig(),
    stock_disabled_providers: [],
    stock_retry_without_proxy: true,
    ...providerProxies,
  };
}

function renderLayout(saveServer: SaveServer = vi.fn<SaveServer>(async () => true), server: ServerSettings | null = serverSettings()) {
  return {
    saveServer,
    ...renderWithProviders(
      <DisplaySettingsProvider>
        <LayoutSettingsTab server={server} saveServer={saveServer} />
      </DisplaySettingsProvider>,
    ),
  };
}

function closestListItem(element: HTMLElement) {
  const row = element.closest('li');
  expect(row).toBeTruthy();
  return row as HTMLElement;
}

describe('LayoutSettingsTab', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {}
  });

  it('hydrates the per-page panel and updates spacing plus density overrides', async () => {
    renderLayout();
    await waitFor(() => expect(screen.getByText(t.pageSpace.scope.library as string)).toBeTruthy());

    const libraryRow = closestListItem(screen.getByText(t.pageSpace.scope.library as string));
    fireEvent.click(within(libraryRow).getByRole('button', { name: t.pageSpace.preset.compact as string }));
    expect(within(libraryRow).getByText(t.pageSpace.customOverride as string)).toBeTruthy();
    fireEvent.click(within(libraryRow).getByRole('button', { name: t.cardDensity.larger as string }));
    expect(within(libraryRow).getByText('240px')).toBeTruthy();
    fireEvent.click(within(libraryRow).getByRole('button', { name: t.cardDensity.denser as string }));
    expect(within(libraryRow).getByText('220px')).toBeTruthy();
    fireEvent.change(within(libraryRow).getByRole('slider', { name: t.cardDensity.label as string }), { target: { value: '300' } });
    expect(within(libraryRow).getByText('300px')).toBeTruthy();
    fireEvent.click(within(libraryRow).getByRole('button', { name: t.settings.densityReset as string }));
    expect(within(libraryRow).getByText('220px')).toBeTruthy();
    fireEvent.click(within(libraryRow).getByRole('button', { name: t.settings.pageSpaceReset as string }));
    expect(within(libraryRow).getByText(t.pageSpace.defaultPreset.replace('{preset}', t.pageSpace.preset.standard))).toBeTruthy();
  });

  it('applies global spacing presets', async () => {
    renderLayout();
    await waitFor(() => expect(screen.getByText(t.pageSpace.scope.library as string)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSpacing as string }));
    const globalPanel = screen.getByText(t.settings.globalPageWidth as string).parentElement;
    expect(globalPanel).toBeTruthy();
    fireEvent.click(within(globalPanel as HTMLElement).getByRole('button', { name: t.pageSpace.preset.wide as string }));
    expect(within(globalPanel as HTMLElement).getByRole('button', { name: t.pageSpace.preset.wide as string }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(globalPanel as HTMLElement).getByRole('button', { name: t.settings.globalPageWidthOff as string }));
    expect(within(globalPanel as HTMLElement).getByRole('button', { name: t.settings.globalPageWidthOff as string }).getAttribute('aria-pressed')).toBe('true');
  });

  it('applies reset-all actions', async () => {
    localStorage.setItem(
      'vn_display_settings_v1',
      JSON.stringify({ pageSpace: { library: 'compact' }, density: { library: 240 } }),
    );
    renderLayout();
    await waitFor(() => expect(screen.getByText(t.pageSpace.scope.library as string)).toBeTruthy());
    const pageReset = screen.getByRole('button', { name: t.settings.pageSpaceResetAll as string }) as HTMLButtonElement;
    const densityReset = screen.getByRole('button', { name: t.settings.perPageResetAll as string }) as HTMLButtonElement;
    await waitFor(() => {
      expect(pageReset.disabled).toBe(false);
      expect(densityReset.disabled).toBe(false);
    });
    fireEvent.click(pageReset);
    fireEvent.click(densityReset);
    await waitFor(() => {
      expect(pageReset.disabled).toBe(true);
      expect(densityReset.disabled).toBe(true);
    });
  });

  it('resets all per-page controls after confirmation', async () => {
    renderLayout();
    await waitFor(() => expect(screen.getByText(t.pageSpace.scope.library as string)).toBeTruthy());
    const libraryRow = closestListItem(screen.getByText(t.pageSpace.scope.library as string));
    fireEvent.click(within(libraryRow).getByRole('button', { name: t.pageSpace.preset.compact as string }));
    fireEvent.click(screen.getByRole('button', { name: t.settings.resetEverything as string }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(within(libraryRow).getByText(t.pageSpace.defaultPreset.replace('{preset}', t.pageSpace.preset.standard))).toBeTruthy());
  });

  it('saves home layout visibility and reset changes', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener(HOME_LAYOUT_EVENT, listener);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    const firstHomeToggle = screen.getAllByRole('button', { name: t.homeSections.show as string })[0];
    fireEvent.click(firstHomeToggle);
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith(expect.objectContaining({ home_section_layout_v1: expect.any(Object) })));
    await waitFor(() => expect(screen.getAllByRole('button', { name: t.homeSections.hide as string }).length).toBeGreaterThan(0));
    await waitFor(() => expect(listener).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: t.homeSections.reset as string }));
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith({
      home_section_layout_v1: {
        sections: DEFAULT_HOME_LAYOUT.sections,
        order: DEFAULT_HOME_LAYOUT.order,
      },
    }));
    window.removeEventListener(HOME_LAYOUT_EVENT, listener);
  });

  it('saves VN section collapse, visibility, and reset actions', async () => {
    const saveServer = vi.fn<SaveServer>(async () => true);
    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener(VN_LAYOUT_EVENT, listener);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    const vnTab = await screen.findByRole('tab', { name: t.vnLayout.restoreTitle as string });
    fireEvent.click(vnTab);
    await screen.findByRole('button', { name: t.vnLayout.reset as string });
    fireEvent.click(screen.getAllByLabelText(t.vnLayout.collapseByDefault as string)[0]);
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith(expect.objectContaining({ vn_detail_section_layout_v1: expect.any(Object) })));
    fireEvent.click(screen.getAllByRole('button', { name: t.vnLayout.hide as string })[0]);
    await waitFor(() => expect(listener).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: t.vnLayout.reset as string }));
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith({ vn_detail_section_layout_v1: null }));
    window.removeEventListener(VN_LAYOUT_EVENT, listener);
  });

  it('handles generic detail section panels and failed saves without dispatching events', async () => {
    const saveServer = vi.fn<SaveServer>(async () => false);
    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener('vn:character-layout-changed', listener);
    renderLayout(saveServer);
    fireEvent.click(screen.getByRole('button', { name: t.settings.layoutSubTabSections as string }));
    fireEvent.click(screen.getByRole('tab', { name: t.characterLayout.restoreTitle as string }));
    const header = screen.getByRole('button', { name: new RegExp(t.characterLayout.restoreTitle as string) });
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getAllByLabelText(t.vnLayout.collapseByDefault as string)[0]);
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith(expect.objectContaining({ character_detail_section_layout_v1: expect.any(Object) })));
    expect(listener).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t.characterLayout.reset as string }));
    await waitFor(() => expect(saveServer).toHaveBeenCalledWith({ character_detail_section_layout_v1: null }));
    window.removeEventListener('vn:character-layout-changed', listener);
  });
});
