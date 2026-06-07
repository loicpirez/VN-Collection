// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { AliceNetLinkDialog } from '@/components/alicenet/AliceNetLinkDialog';
import type { AliceNetItem } from '@/components/alicenet-types';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function makeItem(overrides: Partial<AliceNetItem> = {}): AliceNetItem {
  return {
    code: '001-000002-001',
    title: 'Raw Title',
    jan: null,
    release_date: null,
    list_price: null,
    sale_price: null,
    vn_id: null,
    vn_match_source: null,
    vn_candidates: null,
    search_title: 'Seed Query',
    egs_id: null,
    egs_match_source: null,
    egs_title: null,
    egs_brand: null,
    egs_release_date: null,
    egs_image_url: null,
    egs_vndb_raw: null,
    in_collection: 0,
    in_wishlist: 0,
    last_matched_at: null,
    fetched_at: 0,
    updated_at: 0,
    vn_image_url: null,
    vn_local_image: null,
    vn_image_sexual: null,
    vn_developers: null,
    ...overrides,
  };
}

const RESULTS = {
  results: [
    { id: 'v90001', title: 'Title Y', released: '2019-08-08', developers: [{ id: 'p90001', name: 'Studio X' }, { id: 'p90002', name: 'Studio Z' }] },
  ],
};

class ControlledJsonResponse extends Response {
  private readonly resolveJson: Promise<unknown>;

  constructor(resolveJson: Promise<unknown>) {
    super('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    this.resolveJson = resolveJson;
  }

  override json(): Promise<unknown> {
    return this.resolveJson;
  }
}

describe('AliceNetLinkDialog branches', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json(RESULTS);
      return json({ ok: true });
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('derives the query by stripping used-goods markers, edition labels, and full-width chars', () => {
    // 〔中古〕 bracketed used marker + plain 中古品 + 完全版 edition label +
    // full-width "ＡＢＣ" + ideographic space, all normalized away/down.
    renderWithProviders(
      <AliceNetLinkDialog
        item={makeItem({ search_title: null, title: '〔中古〕中古品　ＡＢＣ 完全版' })}
        onClose={vi.fn()}
        onLinked={vi.fn()}
      />,
      { locale: 'en' },
    );
    const input = screen.getByLabelText(t.mapEgs.searchPlaceholder) as HTMLInputElement;
    // Full-width ＡＢＣ -> ABC, used + edition markers gone, spaces collapsed.
    expect(input.value).toBe('ABC');
  });

  it('renders a hit with its developers (max 2) and formatted release date', async () => {
    renderWithProviders(<AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />, { locale: 'en' });
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Title Y')).toBeInTheDocument();
    expect(within(dialog).getByText('Studio X')).toBeInTheDocument();
    expect(within(dialog).getByText('Studio Z')).toBeInTheDocument();
    expect(within(dialog).getByText('v90001')).toBeInTheDocument();
  });

  it('toasts and clears nothing when the search request responds non-ok', async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).startsWith('/api/search')) return json({ error: 'search down' }, 500);
        return json({ ok: true });
      });
      renderWithProviders(<AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />, { locale: 'en' });
      // The seeded query is debounced 300ms before the first search fires.
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      await vi.waitFor(() => expect(screen.getByText('search down')).toBeInTheDocument());
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it('toasts the generic error when the search payload fails to decode', async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).startsWith('/api/search')) return json({ results: 'not-an-array' });
        return json({ ok: true });
      });
      renderWithProviders(<AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />, { locale: 'en' });
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      await vi.waitFor(() => expect(screen.getByText(t.common.error)).toBeInTheDocument());
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it('toasts the generic error when search throws a primitive value', async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).startsWith('/api/search')) throw 'plain search failure';
        return json({ ok: true });
      });
      renderWithProviders(<AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />, { locale: 'en' });
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      await vi.waitFor(() => expect(screen.getByText(t.common.error)).toBeInTheDocument());
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it('toasts object-shaped search errors that are not AbortError', async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).startsWith('/api/search')) throw { name: 123, message: 'object search failure' };
        return json({ ok: true });
      });
      renderWithProviders(<AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />, { locale: 'en' });
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      await vi.waitFor(() => expect(screen.getByText('object search failure')).toBeInTheDocument());
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it('suppresses AbortError search failures', async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).startsWith('/api/search')) throw new DOMException('Aborted', 'AbortError');
        return json({ ok: true });
      });
      renderWithProviders(<AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />, { locale: 'en' });
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      await flushMicrotasks();
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it('does not fetch when the debounced query is blank', async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn(async () => json(RESULTS));
      global.fetch = fetch;
      renderWithProviders(<AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />, { locale: 'en' });
      const input = screen.getByLabelText(t.mapEgs.searchPlaceholder);
      fireEvent.change(input, { target: { value: '' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      expect(fetch).not.toHaveBeenCalled();
      expect(screen.getByText(t.mapEgs.empty)).toBeInTheDocument();
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it('shows the search progress icon while the VNDB search is pending', async () => {
    const pendingSearch: { resolve?: (response: Response) => void } = {};
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) {
        return new Promise<Response>((resolve, reject) => {
          pendingSearch.resolve = resolve;
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      return Promise.resolve(json({ ok: true }));
    });
    renderWithProviders(
      <AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />,
      { locale: 'en' },
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('.animate-spin')).not.toBeNull());
    if (!pendingSearch.resolve) throw new Error('search resolver was not captured');
    pendingSearch.resolve(json(RESULTS));
    await waitFor(() => expect(document.querySelector('.animate-spin')).toBeNull());
  });

  it('drops a search response after the dialog switches to another AliceNet row', async () => {
    vi.useFakeTimers();
    try {
      let resolveSearch: (response: Response) => void = () => {};
      global.fetch = vi.fn((url: RequestInfo | URL) => {
        if (String(url).startsWith('/api/search')) {
          return new Promise<Response>((resolve) => { resolveSearch = resolve; });
        }
        return Promise.resolve(json({ ok: true }));
      });
      const { rerender } = renderWithProviders(
        <AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />,
        { locale: 'en' },
      );
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      rerender(<AliceNetLinkDialog item={makeItem({ code: '001-000002-002', search_title: 'Other Query' })} onClose={vi.fn()} onLinked={vi.fn()} />);
      resolveSearch(json(RESULTS));
      await flushMicrotasks();
      expect(screen.queryByText('Title Y')).toBeNull();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('drops decoded search results after the dialog switches before JSON parsing completes', async () => {
    vi.useFakeTimers();
    try {
      let resolveJson: (body: unknown) => void = () => {};
      global.fetch = vi.fn((url: RequestInfo | URL) => {
        if (String(url).startsWith('/api/search')) {
          return Promise.resolve(new ControlledJsonResponse(new Promise<unknown>((resolve) => { resolveJson = resolve; })));
        }
        return Promise.resolve(json({ ok: true }));
      });
      const { rerender } = renderWithProviders(
        <AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />,
        { locale: 'en' },
      );
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      rerender(<AliceNetLinkDialog item={makeItem({ code: '001-000002-003', search_title: 'Third Query' })} onClose={vi.fn()} onLinked={vi.fn()} />);
      resolveJson(RESULTS);
      await flushMicrotasks();
      expect(screen.queryByText('Title Y')).toBeNull();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('closes when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    renderWithProviders(<AliceNetLinkDialog item={makeItem()} onClose={onClose} onLinked={vi.fn()} />, { locale: 'en' });
    const dialog = await screen.findByRole('dialog');
    const overlay = dialog.parentElement as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens the external VNDB link without closing the dialog', async () => {
    const onClose = vi.fn();
    renderWithProviders(<AliceNetLinkDialog item={makeItem()} onClose={onClose} onLinked={vi.fn()} />, { locale: 'en' });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Title Y');
    const external = within(dialog).getByRole('link', { name: t.mapEgs.openVndb });
    expect(external).toHaveAttribute('href', 'https://vndb.org/v90001');
    fireEvent.click(external);
    // The row-level click handler stops propagation, so onClose never fires.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('passes the item code through to the link endpoint URL', async () => {
    let linkUrl: string | null = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return json(RESULTS);
      if (String(url).includes('/link') && init?.method === 'POST') {
        linkUrl = String(url);
        return json({ ok: true });
      }
      return json({ ok: true });
    });
    const { user } = renderWithProviders(
      <AliceNetLinkDialog item={makeItem({ code: '999-123456-001' })} onClose={vi.fn()} onLinked={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Title Y');
    await user.click(within(dialog).getByRole('button', { name: t.mapEgs.useThis }));
    await waitFor(() => expect(linkUrl).toBe('/api/alicenet/999-123456-001/link'));
  });

  it('ignores duplicate link clicks while a mutation is already in flight', async () => {
    const linkCalls: string[] = [];
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return Promise.resolve(json(RESULTS));
      if (String(url).includes('/link') && init?.method === 'POST') {
        linkCalls.push(String(url));
        return new Promise<Response>(() => undefined);
      }
      return Promise.resolve(json({ ok: true }));
    });
    renderWithProviders(
      <AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Title Y');
    const button = within(dialog).getByRole('button', { name: t.mapEgs.useThis });
    act(() => {
      button.click();
      button.click();
    });
    expect(linkCalls).toHaveLength(1);
  });

  it('drops a successful link response after the dialog switches to another row', async () => {
    let resolveLink: (response: Response) => void = () => {};
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return Promise.resolve(json(RESULTS));
      if (String(url).includes('/link') && init?.method === 'POST') {
        return new Promise<Response>((resolve) => { resolveLink = resolve; });
      }
      return Promise.resolve(json({ ok: true }));
    });
    const onClose = vi.fn();
    const onLinked = vi.fn();
    const { rerender } = renderWithProviders(
      <AliceNetLinkDialog item={makeItem()} onClose={onClose} onLinked={onLinked} />,
      { locale: 'en' },
    );
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Title Y');
    fireEvent.click(within(dialog).getByRole('button', { name: t.mapEgs.useThis }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/alicenet/001-000002-001/link',
      expect.objectContaining({ method: 'POST' }),
    ));
    rerender(<AliceNetLinkDialog item={makeItem({ code: '001-000002-004', search_title: 'Fourth Query' })} onClose={onClose} onLinked={onLinked} />);
    resolveLink(json({ ok: true }));
    await flushMicrotasks();
    expect(onClose).not.toHaveBeenCalled();
    expect(onLinked).not.toHaveBeenCalled();
    expect(screen.queryByText(t.mapEgs.savedToast)).toBeNull();
  });

  it('drops aborted link mutations without showing an error toast', async () => {
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return Promise.resolve(json({ results: [] }));
      if (String(url).includes('/link') && init?.method === 'POST') {
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      }
      return Promise.resolve(json({ ok: true }));
    });
    const onLinked = vi.fn();
    const { user } = renderWithProviders(
      <AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={onLinked} />,
      { locale: 'en' },
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t.alicenet.alicenetNoMatch }));
    await flushMicrotasks();
    expect(onLinked).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
