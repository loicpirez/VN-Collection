// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { StockLookupClient } from '@/components/StockLookupClient';
import type { VnPickerHit } from '@/components/VnSourcePicker';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/stock',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** The unified picker is exercised in its own file; expose a pick trigger here. */
vi.mock('@/components/VnSourcePicker', () => ({
  VnSourcePicker: ({ onPick }: { onPick: (hit: VnPickerHit) => void }) => (
    <button type="button" data-testid="pick" onClick={() => onPick({ id: 'v90042', title: 'Picked', source: 'vndb' })}>
      pick
    </button>
  ),
}));

/** StockPanel is a separate assigned component; render a prop-echoing stub. */
vi.mock('@/components/StockPanel', () => ({
  StockPanel: ({
    vnId,
    title,
    placeMap,
    placeLinksUnavailable,
    titleResolutionUnavailable,
    defaultProviderScope,
  }: {
    vnId: string;
    title?: string;
    placeMap?: Record<string, number>;
    placeLinksUnavailable?: boolean;
    titleResolutionUnavailable?: boolean;
    defaultProviderScope?: 'all' | 'physical';
  }) => (
    <div data-testid="stock-panel">
      <span data-testid="panel-vn">{vnId}</span>
      <span data-testid="panel-title">{title ?? ''}</span>
      <span data-testid="panel-places">{Object.keys(placeMap ?? {}).join(',')}</span>
      <span data-testid="panel-place-warning">{String(placeLinksUnavailable ?? false)}</span>
      <span data-testid="panel-title-warning">{String(titleResolutionUnavailable ?? false)}</span>
      <span data-testid="panel-provider-scope">{defaultProviderScope ?? ''}</span>
    </div>
  ),
}));

/** The batch client mounts its own network lifecycle; stub it out. */
vi.mock('@/components/StockBatchClient', () => ({
  StockBatchClient: () => <div data-testid="batch-client" />,
}));

vi.mock('@/components/StockRecentActivity', () => ({
  StockRecentActivity: () => <div data-testid="recent-stock-activity" />,
}));

vi.mock('@/components/AliceNetClient', () => ({
  AliceNetClient: ({ embedded, basePath }: { embedded?: boolean; basePath?: string }) => (
    <div data-testid="alicenet-client" data-embedded={String(embedded)} data-base-path={basePath ?? ''} />
  ),
}));

const t = dictionaries[DEFAULT_LOCALE];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function routedFetch(opts: { providerMap?: unknown; vnTitle?: unknown; titleFail?: boolean } = {}) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.startsWith('/api/places/provider-map')) {
      return json(opts.providerMap ?? { map: {} });
    }
    if (u.startsWith('/api/vn/')) {
      if (opts.titleFail) return new Response('boom', { status: 500 });
      return json(opts.vnTitle ?? { vn: { title: 'Resolved Title' } });
    }
    return json({});
  });
}

function routedFetchWithFailures(opts: { providerMapStatus?: number; titleReject?: Error; vnTitle?: unknown } = {}) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.startsWith('/api/places/provider-map')) {
      return opts.providerMapStatus ? new Response('provider map failed', { status: opts.providerMapStatus }) : json({ broken: true });
    }
    if (u.startsWith('/api/vn/')) {
      if (opts.titleReject) throw opts.titleReject;
      return json(opts.vnTitle ?? { broken: true });
    }
    return json({});
  });
}

describe('StockLookupClient', () => {
  beforeEach(() => {
    pushMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the pick-a-VN placeholder and no panel when initialVnId is null', async () => {
    global.fetch = routedFetch();
    renderWithProviders(<StockLookupClient initialVnId={null} />);
    expect(screen.getByText(t.stock.pickVn as string)).toBeTruthy();
    expect(screen.queryByTestId('stock-panel')).toBeNull();
    // The provider-map fetch still fires on mount.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/places/provider-map', expect.any(Object)));
    expect(screen.getByTestId('batch-client')).toBeTruthy();
    expect(screen.getByTestId('recent-stock-activity')).toBeTruthy();
    expect(screen.queryByTestId('alicenet-client')).toBeNull();
  });

  it('renders the panel inside the boundary and resolves the VN title when initialVnId is set', async () => {
    global.fetch = routedFetch({ vnTitle: { vn: { title: 'Resolved Title' } } });
    renderWithProviders(<StockLookupClient initialVnId="v90042" />);
    expect(screen.getByTestId('stock-panel')).toBeTruthy();
    expect(screen.getByTestId('panel-vn').textContent).toBe('v90042');
    expect(screen.getByTestId('panel-provider-scope').textContent).toBe('all');
    expect(screen.queryByTestId('recent-stock-activity')).toBeNull();
    // Title arrives from /api/vn/[id].
    await waitFor(() => expect(screen.getByTestId('panel-title').textContent).toBe('Resolved Title'));
    expect(screen.getByTestId('panel-title-warning').textContent).toBe('false');
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u === '/api/vn/v90042')).toBe(true);
  });

  it('passes the resolved provider map down to the panel as placeMap', async () => {
    global.fetch = routedFetch({ providerMap: { map: { 'Studio X Shop': 7, 'Branch Beta': 9 } } });
    renderWithProviders(<StockLookupClient initialVnId="v90042" />);
    await waitFor(() => expect(screen.getByTestId('panel-places').textContent).toContain('Studio X Shop'));
    expect(screen.getByTestId('panel-places').textContent).toContain('Branch Beta');
  });

  it('routes to the stock page for the picked VN when a hit is selected', () => {
    global.fetch = routedFetch();
    renderWithProviders(<StockLookupClient initialVnId={null} />);
    fireEvent.click(screen.getByTestId('pick'));
    expect(pushMock).toHaveBeenCalledWith('/stock?vn=v90042');
  });

  it('keeps rendering without a title when the VN title fetch fails', async () => {
    global.fetch = routedFetch({ titleFail: true });
    renderWithProviders(<StockLookupClient initialVnId="v90042" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/vn/v90042', expect.any(Object)));
    // Panel still mounted; title stays empty (no crash on the failed fetch).
    expect(screen.getByTestId('stock-panel')).toBeTruthy();
    expect(screen.getByTestId('panel-title').textContent).toBe('');
    await waitFor(() => expect(screen.getByTestId('panel-title-warning').textContent).toBe('true'));
  });

  it('ignores failed and undecodable provider-map responses', async () => {
    global.fetch = routedFetchWithFailures({ providerMapStatus: 500 });
    renderWithProviders(<StockLookupClient initialVnId="v90042" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/places/provider-map', expect.any(Object)));
    expect(screen.getByTestId('panel-places').textContent).toBe('');
    await waitFor(() => expect(screen.getByTestId('panel-place-warning').textContent).toBe('true'));

    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = routedFetchWithFailures();
    renderWithProviders(<StockLookupClient initialVnId="v90043" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/places/provider-map', expect.any(Object)));
    expect(screen.getAllByTestId('panel-places').at(-1)?.textContent).toBe('');
    await waitFor(() => expect(screen.getAllByTestId('panel-place-warning').at(-1)?.textContent).toBe('true'));
  });

  it('keeps the title empty for undecodable and aborted title responses', async () => {
    global.fetch = routedFetchWithFailures({ vnTitle: { broken: true } });
    renderWithProviders(<StockLookupClient initialVnId="v90042" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/vn/v90042', expect.any(Object)));
    expect(screen.getByTestId('panel-title').textContent).toBe('');
    await waitFor(() => expect(screen.getByTestId('panel-title-warning').textContent).toBe('true'));

    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = routedFetchWithFailures({ titleReject: abortError });
    renderWithProviders(<StockLookupClient initialVnId="v90043" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/vn/v90043', expect.any(Object)));
    expect(console.error).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('panel-title-warning').at(-1)?.textContent).toBe('false');
  });

  it('logs a stable operation code when title enrichment rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('network title failure');
    global.fetch = routedFetchWithFailures({ titleReject: failure });

    renderWithProviders(<StockLookupClient initialVnId="v90046" />);
    await waitFor(() => expect(screen.getByTestId('panel-title-warning').textContent).toBe('true'));
    expect(errorSpy).toHaveBeenCalledWith('[VN_STOCK_TITLE_RESOLVE_FAILED]', failure);
  });

  it('ignores successful enrichment responses that settle after unmount', async () => {
    let resolveMap: (response: Response) => void = () => undefined;
    let resolveTitle: (response: Response) => void = () => undefined;
    global.fetch = vi.fn((url: RequestInfo | URL) => new Promise<Response>((resolve) => {
      if (String(url).startsWith('/api/places/provider-map')) resolveMap = resolve;
      else resolveTitle = resolve;
    }));
    const view = renderWithProviders(<StockLookupClient initialVnId="v90044" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    view.unmount();
    await act(async () => {
      resolveMap(json({ map: { 'Late Shop': 1 } }));
      resolveTitle(json({ vn: { title: 'Late title' } }));
      await Promise.resolve();
    });

    expect(screen.queryByTestId('stock-panel')).toBeNull();
  });

  it('ignores enrichment errors that settle after unmount', async () => {
    let rejectMap: (error: Error) => void = () => undefined;
    let rejectTitle: (error: Error) => void = () => undefined;
    global.fetch = vi.fn((url: RequestInfo | URL) => new Promise<Response>((_resolve, reject) => {
      if (String(url).startsWith('/api/places/provider-map')) rejectMap = reject;
      else rejectTitle = reject;
    }));
    const view = renderWithProviders(<StockLookupClient initialVnId="v90045" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    view.unmount();
    await act(async () => {
      rejectMap(new Error('late map failure'));
      rejectTitle(new Error('late title failure'));
      await Promise.resolve();
    });

    expect(console.error).not.toHaveBeenCalled();
  });
});
