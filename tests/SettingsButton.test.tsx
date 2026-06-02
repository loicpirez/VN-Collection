// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { SettingsButton } from '@/components/SettingsButton';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';
import { STOCK_PROVIDER_IDS } from '@/lib/stock-provider-constants';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  startTour: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: mocks.refresh, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/components/TutorialTour', () => ({
  startTour: mocks.startTour,
}));

vi.mock('@/components/settings/LayoutSettingsTab', () => ({
  LayoutSettingsTab: ({ saveServer }: { saveServer: (patch: { default_sort?: string; vn_detail_section_layout_v1?: null }) => Promise<boolean> }) => (
    <>
      <button type="button" onClick={() => { void saveServer({ default_sort: 'title' }); }}>
        layout tab mock
      </button>
      <button type="button" onClick={() => { void saveServer({ vn_detail_section_layout_v1: null }); }}>
        layout refresh mock
      </button>
    </>
  ),
}));

vi.mock('@/components/settings/IntegrationsSettingsTab', () => ({
  IntegrationsSettingsTab: ({ saveServer }: { saveServer: (patch: { steam_id?: string }) => Promise<boolean> }) => (
    <button type="button" onClick={() => { void saveServer({ steam_id: '7656' }); }}>
      integrations tab mock
    </button>
  ),
}));

const t = dictionaries[DEFAULT_LOCALE];

function proxyConfig() {
  return {
    enabled: false,
    protocol: 'http',
    host: '',
    port: null,
    username: '',
    hasPassword: false,
  };
}

function serverSettings() {
  const providerProxies: Record<string, ReturnType<typeof proxyConfig>> = {};
  for (const id of STOCK_PROVIDER_IDS) {
    providerProxies[`${id}_proxy_config`] = proxyConfig();
  }
  return {
    vndb_token: { hasToken: true, preview: 'abc...', envFallback: false },
    random_quote_source: 'all',
    default_sort: 'updated_at',
    default_order: 'desc',
    default_group: 'none',
    home_section_layout_v1: {},
    vn_detail_section_layout_v1: {},
    series_detail_section_layout_v1: {},
    character_detail_section_layout_v1: {},
    staff_detail_section_layout_v1: {},
    producer_detail_section_layout_v1: {},
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
    alicenet_proxy_config: proxyConfig(),
    stock_proxy_config: proxyConfig(),
    stock_disabled_providers: [],
    stock_retry_without_proxy: true,
    ...providerProxies,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function pullStatusPayload() {
  return {
    ok: true,
    needsAuth: false,
    scanned: 3,
    updated: 1,
    unchanged: 1,
    skippedNotInCollection: 1,
    changes: [{ vn_id: 'v90001', title: 'Title Y', from: 'planning', to: 'completed' }],
    unmatched: [{ vn_id: 'v90002', status: 'playing' }],
  };
}

function renderSettings() {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <SettingsButton />
    </DisplaySettingsProvider>,
  );
}

describe('SettingsButton', () => {
  let settingsGetStatus: number;
  let settingsPatchStatus: number;
  let settingsPatchBody: unknown;
  let pullStatus: number;
  let pullBody: unknown;

  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.startTour.mockReset();
    settingsGetStatus = 200;
    settingsPatchStatus = 200;
    settingsPatchBody = serverSettings();
    pullStatus = 200;
    pullBody = pullStatusPayload();
    try {
      localStorage.clear();
    } catch {}
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/settings' && (!init?.method || init.method === 'GET')) return json(serverSettings(), settingsGetStatus);
      if (u === '/api/settings' && init?.method === 'PATCH') return json(settingsPatchBody, settingsPatchStatus);
      if (u === '/api/vndb/pull-statuses') return json(pullBody, pullStatus);
      return json({});
    });
  });

  it('opens the modal, toggles display/content preferences, and supports tab keyboard navigation', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: t.settings.title as string }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const hideImages = within(dialog).getByRole('switch', { name: t.settings.hideImages as string });
    expect(hideImages.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(hideImages);
    expect(hideImages.getAttribute('aria-checked')).toBe('true');
    const preferLocal = within(dialog).getByRole('switch', { name: t.settings.preferLocal as string });
    fireEvent.click(preferLocal);
    expect(preferLocal.getAttribute('aria-checked')).toBe('false');
    const preferNative = within(dialog).getByRole('switch', { name: t.settings.preferNativeTitle as string });
    fireEvent.click(preferNative);
    expect(preferNative.getAttribute('aria-checked')).toBe('true');
    const headerSpace = within(dialog).getByRole('switch', { name: t.settings.headerFollowsPageSpace as string });
    fireEvent.click(headerSpace);
    expect(headerSpace.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(within(dialog).getByRole('tab', { name: t.settings.tabs.content as string }));
    const majorSpoilers = within(dialog).getByRole('radio', { name: t.spoiler.lvl2 as string });
    fireEvent.click(majorSpoilers);
    expect(majorSpoilers.getAttribute('aria-checked')).toBe('true');
    const noSpoilers = within(dialog).getByRole('radio', { name: t.spoiler.lvl0 as string });
    fireEvent.click(noSpoilers);
    expect(noSpoilers.getAttribute('aria-checked')).toBe('true');
    const blurR18 = within(dialog).getByRole('switch', { name: t.settings.blurR18 as string });
    fireEvent.click(blurR18);
    expect(blurR18.getAttribute('aria-checked')).toBe('false');
    const hideSexual = within(dialog).getByRole('switch', { name: t.settings.hideSexual as string });
    fireEvent.click(hideSexual);
    expect(hideSexual.getAttribute('aria-checked')).toBe('true');
    const threshold = within(dialog).getByRole('slider', { name: new RegExp(t.settings.nsfwThreshold as string) });
    fireEvent.change(threshold, { target: { value: '0.7' } });
    expect((threshold as HTMLInputElement).value).toBe('0.7');

    const tablist = within(dialog).getByRole('tablist', { name: t.settings.tabsLabel as string });
    fireEvent.keyDown(tablist, { key: 'End' });
    expect(within(dialog).getByRole('tab', { name: t.settings.tabs.shortcuts as string }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(within(dialog).getByRole('tab', { name: t.settings.tabs.display as string }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(within(dialog).getByRole('tab', { name: t.settings.tabs.shortcuts as string }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(within(dialog).getByRole('tab', { name: t.settings.tabs.display as string }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tablist, { key: 'Tab' });
    expect(within(dialog).getByRole('tab', { name: t.settings.tabs.display as string }).getAttribute('aria-selected')).toBe('true');
  });

  it('saves account settings', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: t.settings.title as string }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('tab', { name: t.settings.tabs.account as string }));
    await waitFor(() => expect(screen.getByText('abc...')).toBeTruthy());

    const tokenInput = within(dialog).getByLabelText(t.settings.vndbTokenPlaceholder as string);
    expect((within(dialog).getByRole('button', { name: t.common.save as string }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(tokenInput, { target: { value: 'new-token' } });
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.save as string }));
    await waitFor(() => expect(JSON.parse(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1]?.method === 'PATCH')?.[1]?.body))).toMatchObject({ vndb_token: 'new-token' }));

    fireEvent.click(within(dialog).getByRole('button', { name: t.settings.vndbTokenClear as string }));
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === 'PATCH' && JSON.parse(String(c[1].body)).vndb_token === null)).toBe(true));

    const writeback = within(dialog).getByRole('checkbox', { name: new RegExp(t.settings.vndbWriteback as string) });
    fireEvent.click(writeback);
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === 'PATCH' && JSON.parse(String(c[1].body)).vndb_writeback === true)).toBe(true));

    const backupUrl = within(dialog).getByLabelText(t.settings.vndbBackupTitle as string);
    const backupEnabled = within(dialog).getByRole('checkbox', { name: new RegExp(t.settings.vndbBackupTitle as string) });
    fireEvent.click(backupEnabled);
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === 'PATCH' && JSON.parse(String(c[1].body)).vndb_backup_enabled === false)).toBe(true));
    fireEvent.blur(backupUrl);
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === 'PATCH' && JSON.parse(String(c[1].body)).vndb_backup_url === null)).toBe(true));
    fireEvent.change(backupUrl, { target: { value: 'https://mirror.example.test/kana' } });
    fireEvent.blur(backupUrl);
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === 'PATCH' && JSON.parse(String(c[1].body)).vndb_backup_url === 'https://mirror.example.test/kana')).toBe(true));
  });

  it('renders the VNDB pull diff from the account tab', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: t.settings.title as string }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('tab', { name: t.settings.tabs.account as string }));
    await waitFor(() => expect(screen.getByText('abc...')).toBeTruthy());
    fireEvent.click(within(dialog).getByRole('button', { name: t.settings.vndbPullAction as string }));
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]) === '/api/vndb/pull-statuses')).toBe(true));
    await waitFor(() => {
      expect(screen.getByText(
        t.settings.vndbPullDiffSummary
          .replace('{updated}', '1')
          .replace('{unchanged}', '1')
          .replace('{skipped}', '1')
          .replace('{scanned}', '3'),
      )).toBeTruthy();
    });
    expect(screen.getByRole('link', { name: 'Title Y' })).toBeTruthy();
    expect(screen.getByText(t.settings.vndbPullUnmatched.replace('{count}', '1'))).toBeTruthy();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('shows the VNDB pull error returned by the API', async () => {
    pullStatus = 500;
    pullBody = {
      ok: false,
      needsAuth: false,
      message: 'sync failed',
      scanned: 0,
      updated: 0,
      unchanged: 0,
      skippedNotInCollection: 0,
      changes: [],
      unmatched: [],
    };
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: t.settings.title as string }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('tab', { name: t.settings.tabs.account as string }));
    await waitFor(() => expect(screen.getByText('abc...')).toBeTruthy());
    fireEvent.click(within(dialog).getByRole('button', { name: t.settings.vndbPullAction as string }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('sync failed'));
  });

  it('opens requested tabs from events and saves through lazy tab bodies', async () => {
    renderSettings();
    act(() => {
      window.dispatchEvent(new CustomEvent('vn:open-settings', { detail: { tab: 'integrations' } }));
    });
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByText('integrations tab mock')).toBeTruthy());
    fireEvent.click(screen.getByText('integrations tab mock'));
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === 'PATCH' && JSON.parse(String(c[1].body)).steam_id === '7656')).toBe(true));

    fireEvent.click(within(dialog).getByRole('tab', { name: t.settings.tabs['vn-page'] as string }));
    await waitFor(() => expect(screen.getByText('layout tab mock')).toBeTruthy());
    fireEvent.click(screen.getByText('layout tab mock'));
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === 'PATCH' && JSON.parse(String(c[1].body)).default_sort === 'title')).toBe(true));
    fireEvent.click(screen.getByText('layout refresh mock'));
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === 'PATCH' && JSON.parse(String(c[1].body)).vn_detail_section_layout_v1 === null)).toBe(true));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());

    fireEvent.click(within(dialog).getByRole('tab', { name: t.settings.tabs.library as string }));
    const sortSelect = within(dialog).getByRole('combobox', { name: t.settings.defaultSortTitle as string });
    fireEvent.change(sortSelect, { target: { value: 'title' } });
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === 'PATCH' && JSON.parse(String(c[1].body)).default_sort === 'title')).toBe(true));
    const orderSelect = within(dialog).getByRole('combobox', { name: t.settings.defaultOrderTitle as string });
    fireEvent.change(orderSelect, { target: { value: 'asc' } });
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === 'PATCH' && JSON.parse(String(c[1].body)).default_order === 'asc')).toBe(true));
    const groupSelect = within(dialog).getByRole('combobox', { name: t.settings.defaultGroupTitle as string });
    fireEvent.change(groupSelect, { target: { value: 'series' } });
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === 'PATCH' && JSON.parse(String(c[1].body)).default_group === 'series')).toBe(true));

    fireEvent.click(within(dialog).getByRole('tab', { name: t.settings.tabs.automation as string }));
    const fanout = within(dialog).getByRole('checkbox', { name: new RegExp(t.settings.vndbFanoutTitle as string) });
    fireEvent.click(fanout);
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[1]?.method === 'PATCH' && JSON.parse(String(c[1].body)).vndb_fanout === false)).toBe(true));
    fireEvent.click(within(dialog).getByRole('button', { name: t.tour.runAgain as string }));
    expect(mocks.startTour).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the display tab for unknown open events and handles reset plus dismissals', async () => {
    renderSettings();
    act(() => {
      window.dispatchEvent(new CustomEvent('vn:open-settings', { detail: { tab: 'unknown' } }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: t.settings.tabs.display as string }).getAttribute('aria-selected')).toBe('true');

    const hideImages = within(dialog).getByRole('switch', { name: t.settings.hideImages as string });
    fireEvent.click(hideImages);
    expect(hideImages.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(dialog).getByRole('button', { name: t.settings.resetDisplay as string }));
    const confirmDialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(hideImages.getAttribute('aria-checked')).toBe('false'));

    fireEvent.click(within(dialog).getByRole('tab', { name: t.settings.tabs.shortcuts as string }));
    expect(within(dialog).getByText(t.shortcuts.help as string)).toBeTruthy();
    const footerClose = within(dialog)
      .getAllByRole('button', { name: t.common.close as string })
      .find((button) => button.textContent === t.common.close);
    expect(footerClose).toBeTruthy();
    fireEvent.click(footerClose as HTMLButtonElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: t.settings.title as string }));
    const reopened = await screen.findByRole('dialog');
    fireEvent.click(within(reopened).getAllByRole('button', { name: t.common.close as string })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: t.settings.title as string }));
    const backdropDialog = await screen.findByRole('dialog');
    const backdrop = backdropDialog.parentElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('continues rendering local preferences when settings load fails', async () => {
    settingsGetStatus = 500;
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: t.settings.title as string }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(within(dialog).getByRole('switch', { name: t.settings.hideImages as string })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('tab', { name: t.settings.tabs.account as string }));
    expect(screen.queryByText('abc...')).toBeNull();
  });

  it('shows save errors from the settings API', async () => {
    settingsPatchStatus = 500;
    settingsPatchBody = { error: 'patch failed' };
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: t.settings.title as string }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('tab', { name: t.settings.tabs.account as string }));
    await waitFor(() => expect(screen.getByText('abc...')).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText(t.settings.vndbTokenPlaceholder as string), { target: { value: 'new-token' } });
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.save as string }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('patch failed'));
  });
});
