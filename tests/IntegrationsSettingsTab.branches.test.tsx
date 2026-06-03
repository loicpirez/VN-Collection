// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { IntegrationsSettingsTab } from '@/components/settings/IntegrationsSettingsTab';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { STOCK_PROVIDER_IDS, STOCK_PROVIDER_LABELS } from '@/lib/stock-provider-constants';
import type { SaveServer } from '@/components/SettingsButton';
import type { ProxyDisplayConfig, ServerSettings } from '@/lib/settings-server-client-shape';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

// Several assertions await a stubbed proxy-test fetch; raise the per-test
// budget above the 5 s default so contention under the parallel forks pool
// cannot trip a correct test.
vi.setConfig({ testTimeout: 15_000 });

function proxyConfig(over: Partial<ProxyDisplayConfig> = {}): ProxyDisplayConfig {
  return { enabled: false, protocol: 'socks5h', host: '', port: null, username: '', hasPassword: false, ...over };
}

function serverSettings(over: Partial<ServerSettings> = {}): ServerSettings {
  const providerProxies: Partial<ServerSettings> = {};
  for (const id of STOCK_PROVIDER_IDS) providerProxies[`${id}_proxy_config`] = proxyConfig();
  return {
    vndb_token: { hasToken: true, preview: 'abc...', envFallback: false },
    random_quote_source: 'all',
    default_sort: 'updated_at',
    default_order: 'desc',
    default_group: 'none',
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
    ...over,
  } as ServerSettings;
}

function render(server: ServerSettings | null, saveServer: SaveServer = vi.fn<SaveServer>(async () => true)) {
  return { saveServer, ...renderWithProviders(<IntegrationsSettingsTab server={server} saveServer={saveServer} />, { locale: 'en' }) };
}

/** Locate the EGS network-proxy section by its compound heading. */
function egsProxySection(): HTMLElement {
  const heading = screen.getByText(`${t.settings.proxyTitle} / ${t.settings.proxyProviderEgs}`);
  return heading.closest('section') as HTMLElement;
}

function jsonOk(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function jsonErr(status = 500, body: unknown = { error: 'boom' }): Response {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn(async () => jsonOk({ ok: true, latencyMs: 12, status: 200 })) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
});

describe('IntegrationsSettingsTab branches', () => {
  it('renders with a null server (defaults) without crashing', () => {
    render(null);
    expect(screen.getByText(t.settings.steamTitle)).toBeInTheDocument();
    // Random quote defaults to "all" highlighted when server is null.
    const allBtn = screen.getByRole('button', { name: t.settings.randomQuoteAll });
    expect(allBtn.className).toContain('bg-accent');
  });

  it('shows the saved badge + clear control for a stored Steam key and clears it', async () => {
    const { saveServer, user } = render(serverSettings({ steam_api_key: { hasKey: true, preview: 'st...' } }));
    expect(screen.getByText(t.settings.credentialSaved)).toBeInTheDocument();
    const steamSection = screen.getByText(t.settings.steamTitle).closest('section') as HTMLElement;
    // The clear control is a text button carrying the clear title; query by
    // title because it sits inside a <label> that owns the input's name.
    await user.click(within(steamSection).getByTitle(t.settings.credentialClear));
    expect(saveServer).toHaveBeenCalledWith({ steam_api_key: null });
  });

  it('saves a typed Steam key on blur and ignores an empty key', () => {
    const { saveServer } = render(serverSettings());
    const keyInput = screen.getByLabelText(t.settings.steamApiKeyLabel);
    fireEvent.blur(keyInput, { target: { value: '   ' } });
    expect(saveServer).not.toHaveBeenCalled();
    fireEvent.blur(keyInput, { target: { value: 'new-steam-key' } });
    expect(saveServer).toHaveBeenCalledWith({ steam_api_key: 'new-steam-key' });
  });

  it('saves a changed SteamID and skips an unchanged one', () => {
    const { saveServer } = render(serverSettings({ steam_id: '123' }));
    const idInput = screen.getByLabelText(t.settings.steamIdLabel);
    fireEvent.blur(idInput, { target: { value: '123' } });
    expect(saveServer).not.toHaveBeenCalled();
    fireEvent.blur(idInput, { target: { value: '' } });
    expect(saveServer).toHaveBeenCalledWith({ steam_id: null });
  });

  it('shows the EGS username badge + reset control and clears it', async () => {
    const { saveServer, user } = render(serverSettings({ egs_username: 'egs-user' }));
    const egsSection = screen.getByText(t.settings.egsTitle).closest('section') as HTMLElement;
    expect(within(egsSection).getByText('egs-user')).toBeInTheDocument();
    await user.click(within(egsSection).getByRole('button', { name: t.settings.egsUsernameReset }));
    expect(saveServer).toHaveBeenCalledWith({ egs_username: null });
  });

  it('saves a changed EGS username on blur', () => {
    const { saveServer } = render(serverSettings({ egs_username: '' }));
    fireEvent.blur(screen.getByLabelText(t.settings.egsUsernameLabel), { target: { value: 'newuser' } });
    expect(saveServer).toHaveBeenCalledWith({ egs_username: 'newuser' });
  });

  it('toggles the proxy-enabled checkbox and persists protocol / host / port / username', () => {
    const { saveServer } = render(serverSettings());
    const section = egsProxySection();
    fireEvent.click(within(section).getByRole('checkbox'));
    expect(saveServer).toHaveBeenCalledWith({ egs_proxy_config: { enabled: true } });
    fireEvent.change(within(section).getByLabelText(t.settings.proxyProtocol), { target: { value: 'http' } });
    expect(saveServer).toHaveBeenCalledWith({ egs_proxy_config: { protocol: 'http' } });
    fireEvent.blur(within(section).getByLabelText(t.settings.proxyHost), { target: { value: 'proxy.example.test ' } });
    expect(saveServer).toHaveBeenCalledWith({ egs_proxy_config: { host: 'proxy.example.test' } });
    // Empty host persists null.
    fireEvent.blur(within(section).getByLabelText(t.settings.proxyHost), { target: { value: '  ' } });
    expect(saveServer).toHaveBeenCalledWith({ egs_proxy_config: { host: null } });
    fireEvent.blur(within(section).getByLabelText(t.settings.proxyPort), { target: { value: '1080' } });
    expect(saveServer).toHaveBeenCalledWith({ egs_proxy_config: { port: 1080 } });
    fireEvent.blur(within(section).getByLabelText(t.settings.proxyPort), { target: { value: '' } });
    expect(saveServer).toHaveBeenCalledWith({ egs_proxy_config: { port: null } });
    fireEvent.blur(within(section).getByLabelText(t.settings.proxyUsername), { target: { value: 'puser' } });
    expect(saveServer).toHaveBeenCalledWith({ egs_proxy_config: { username: 'puser' } });
  });

  it('renders the stored-password chip and supports Replace and Clear', async () => {
    const { saveServer, user } = render(serverSettings({ egs_proxy_config: proxyConfig({ hasPassword: true }) }));
    const section = egsProxySection();
    expect(within(section).getByText(t.settings.proxyPasswordStoredBadge)).toBeInTheDocument();
    // Clear wipes the stored password.
    await user.click(within(section).getByRole('button', { name: t.settings.proxyPasswordClear }));
    expect(saveServer).toHaveBeenCalledWith({ egs_proxy_config: { password: null } });
    // Replace swaps to the editable password input.
    await user.click(within(section).getByRole('button', { name: t.settings.proxyPasswordReplace }));
    await waitFor(() => expect(within(section).getByLabelText(t.settings.proxyPassword)).toBeInTheDocument());
  });

  it('saves a new password on blur and toggles visibility in the edit state', async () => {
    const { saveServer, user } = render(serverSettings({ egs_proxy_config: proxyConfig({ hasPassword: false }) }));
    const section = egsProxySection();
    const pw = within(section).getByLabelText(t.settings.proxyPassword) as HTMLInputElement;
    expect(pw.type).toBe('password');
    await user.click(within(section).getByRole('button', { name: t.settings.proxyPasswordShow }));
    expect(pw.type).toBe('text');
    await user.click(within(section).getByRole('button', { name: t.settings.proxyPasswordHide }));
    expect(pw.type).toBe('password');
    // Typing drives the onChange draft state, then blur persists it.
    await user.type(pw, 'secret-pw');
    expect(pw.value).toBe('secret-pw');
    fireEvent.blur(pw);
    expect(saveServer).toHaveBeenCalledWith({ egs_proxy_config: { password: 'secret-pw' } });
    // A blur with an empty value must not persist (the falsy branch).
    fireEvent.blur(pw, { target: { value: '' } });
    expect(saveServer).toHaveBeenCalledTimes(1);
  });

  it('disables the Test button while the proxy is off and runs a successful probe when enabled', async () => {
    global.fetch = vi.fn(async () => jsonOk({ ok: true, latencyMs: 42, status: 200 })) as unknown as typeof fetch;
    const { user } = render(serverSettings({ egs_proxy_config: proxyConfig({ enabled: true }) }));
    const section = egsProxySection();
    const testBtn = within(section).getByRole('button', { name: t.settings.proxyTestButton });
    expect(testBtn).toBeEnabled();
    await user.click(testBtn);
    await waitFor(() => expect(within(section).getByRole('status')).toHaveTextContent('42'));
  });

  it('ignores a second Test click while the first probe is in flight', async () => {
    let resolveProbe: ((r: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((res) => { resolveProbe = res; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { user } = render(serverSettings({ egs_proxy_config: proxyConfig({ enabled: true }) }));
    const section = egsProxySection();
    const testBtn = within(section).getByRole('button', { name: t.settings.proxyTestButton });
    await user.click(testBtn);
    // The button shows the spinner; a second click is guarded out.
    await user.click(testBtn);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveProbe?.(jsonOk({ ok: true, latencyMs: 9, status: 200 }));
    await waitFor(() => expect(within(section).getByRole('status')).toHaveTextContent('9'));
  });

  it('renders a successful probe with a zero-latency fallback when ms is absent', async () => {
    // ok:true with latencyMs:0 exercises the `ms ?? 0` template branch.
    global.fetch = vi.fn(async () => jsonOk({ ok: true, latencyMs: 0, status: 204 })) as unknown as typeof fetch;
    const { user } = render(serverSettings({ egs_proxy_config: proxyConfig({ enabled: true }) }));
    const section = egsProxySection();
    await user.click(within(section).getByRole('button', { name: t.settings.proxyTestButton }));
    await waitFor(() => expect(within(section).getByRole('status')).toHaveTextContent(
      t.settings.proxyTestOk.replace('{ms}', '0'),
    ));
  });

  it('shows a failure status when the probe reports not ok', async () => {
    global.fetch = vi.fn(async () => jsonOk({ ok: false, latencyMs: 5, error: 'refused' })) as unknown as typeof fetch;
    const { user } = render(serverSettings({ egs_proxy_config: proxyConfig({ enabled: true }) }));
    const section = egsProxySection();
    await user.click(within(section).getByRole('button', { name: t.settings.proxyTestButton }));
    await waitFor(() => expect(within(section).getByRole('status')).toHaveTextContent('refused'));
  });

  it('shows an error status when the probe request is not ok', async () => {
    global.fetch = vi.fn(async () => jsonErr(500, { error: 'http-500' })) as unknown as typeof fetch;
    const { user } = render(serverSettings({ egs_proxy_config: proxyConfig({ enabled: true }) }));
    const section = egsProxySection();
    await user.click(within(section).getByRole('button', { name: t.settings.proxyTestButton }));
    await waitFor(() => expect(within(section).getByRole('status')).toHaveTextContent('http-500'));
  });

  it('shows an error status when the probe decoder rejects the payload', async () => {
    global.fetch = vi.fn(async () => jsonOk({ garbage: true })) as unknown as typeof fetch;
    const { user } = render(serverSettings({ egs_proxy_config: proxyConfig({ enabled: true }) }));
    const section = egsProxySection();
    await user.click(within(section).getByRole('button', { name: t.settings.proxyTestButton }));
    await waitFor(() => expect(within(section).getByRole('status')).toHaveTextContent(t.common.unknownError));
  });

  it('disables stock providers individually and via enable-all / disable-all', async () => {
    const { saveServer, user } = render(serverSettings({ stock_disabled_providers: [] }));
    const toggleSummary = screen.getByText(t.settings.stockProvidersTitle);
    fireEvent.click(toggleSummary);
    const firstId = STOCK_PROVIDER_IDS[0];
    const firstSwitch = screen.getByRole('switch', { name: new RegExp(STOCK_PROVIDER_LABELS[firstId]) });
    expect(firstSwitch).toHaveAttribute('aria-checked', 'true');
    await user.click(firstSwitch);
    expect(saveServer).toHaveBeenCalledWith({ stock_disabled_providers: [firstId] });

    await user.click(screen.getByRole('button', { name: t.settings.stockProviderDisableAll }));
    expect(saveServer).toHaveBeenCalledWith({ stock_disabled_providers: [...STOCK_PROVIDER_IDS] });
    // Enable-all sends null (empty list collapses to null in the parent map).
    await user.click(screen.getByRole('button', { name: t.settings.stockProviderEnableAll }));
    expect(saveServer).toHaveBeenCalledWith({ stock_disabled_providers: null });
  });

  it('re-enables an already-disabled provider switch (delete branch)', async () => {
    const firstId = STOCK_PROVIDER_IDS[0];
    const { saveServer, user } = render(serverSettings({ stock_disabled_providers: [firstId] }));
    fireEvent.click(screen.getByText(t.settings.stockProvidersTitle));
    const firstSwitch = screen.getByRole('switch', { name: new RegExp(STOCK_PROVIDER_LABELS[firstId]) });
    expect(firstSwitch).toHaveAttribute('aria-checked', 'false');
    await user.click(firstSwitch);
    expect(saveServer).toHaveBeenCalledWith({ stock_disabled_providers: null });
  });

  it('toggles the retry-without-proxy checkbox', () => {
    const { saveServer } = render(serverSettings({ stock_retry_without_proxy: false }));
    const retry = screen.getByRole('checkbox', { name: new RegExp(t.settings.stockRetryDirectTitle) });
    fireEvent.click(retry);
    expect(saveServer).toHaveBeenCalledWith({ stock_retry_without_proxy: true });
  });

  it('wires each fixed proxy section onSave to its own DB key', () => {
    const { saveServer } = render(serverSettings());
    const cases: Array<[string, string]> = [
      [t.settings.proxyProviderVndb, 'vndb_proxy_config'],
      [t.settings.proxyProviderVndbmirror, 'vndbmirror_proxy_config'],
      [t.settings.proxyProviderAliceNet, 'alicenet_proxy_config'],
      [t.settings.proxyProviderStock, 'stock_proxy_config'],
    ];
    for (const [label, key] of cases) {
      const section = screen.getByText(`${t.settings.proxyTitle} / ${label}`).closest('section') as HTMLElement;
      fireEvent.click(within(section).getByRole('checkbox'));
      expect(saveServer).toHaveBeenCalledWith({ [key]: { enabled: true } });
    }
  });

  it('wires a per-shop override section onSave to its shop DB key', () => {
    const firstId = STOCK_PROVIDER_IDS[0];
    const { saveServer } = render(serverSettings());
    const overridesSection = screen.getByText(t.settings.proxyShopOverridesTitle).closest('section') as HTMLElement;
    const shopHeading = within(overridesSection).getAllByRole('heading', { level: 4 })
      .find((h) => h.textContent === STOCK_PROVIDER_LABELS[firstId]) as HTMLElement;
    const shopSection = shopHeading.closest('section') as HTMLElement;
    fireEvent.click(within(shopSection).getByRole('checkbox'));
    expect(saveServer).toHaveBeenCalledWith({ [`${firstId}_proxy_config`]: { enabled: true } });
  });

  it('switches the random-quote source to mine', async () => {
    const { saveServer, user } = render(serverSettings({ random_quote_source: 'all' }));
    await user.click(screen.getByRole('button', { name: t.settings.randomQuoteMine }));
    expect(saveServer).toHaveBeenCalledWith({ random_quote_source: 'mine' });
  });

  it('renders per-shop override sections in compact mode when expanded', () => {
    render(serverSettings());
    const overridesSummary = screen.getByText(t.settings.proxyShopOverridesTitle);
    fireEvent.click(overridesSummary);
    // Each shop label renders as a compact h4 heading inside the overrides grid.
    const overridesSection = overridesSummary.closest('section') as HTMLElement;
    const headings = within(overridesSection).getAllByRole('heading', { level: 4 });
    expect(headings.length).toBe(STOCK_PROVIDER_IDS.length);
    expect(headings.some((h) => h.textContent === STOCK_PROVIDER_LABELS[STOCK_PROVIDER_IDS[0]])).toBe(true);
  });
});
