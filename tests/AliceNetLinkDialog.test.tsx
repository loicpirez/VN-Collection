// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { AliceNetLinkDialog } from '@/components/alicenet/AliceNetLinkDialog';
import type { AliceNetItem } from '@/components/alicenet-types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function makeItem(overrides: Partial<AliceNetItem> = {}): AliceNetItem {
  return {
    code: '001-000001-001',
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

const SEARCH_RESULTS = {
  results: [
    { id: 'v90001', title: 'Result One', released: '2017-01-01', developers: [{ id: 'p90001', name: 'Studio X' }] },
    { id: 'v90002', title: 'Result Two', released: null },
  ],
};

describe('AliceNetLinkDialog', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json(SEARCH_RESULTS);
      return json({ ok: true });
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the modal header with the source title and seeds the query from search_title', async () => {
    renderWithProviders(
      <AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />, { locale: 'en' },
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Raw Title')).toBeInTheDocument();
    const input = within(dialog).getByLabelText('Search VNDB...') as HTMLInputElement;
    expect(input.value).toBe('Seed Query');
    expect(await within(dialog).findByText('Result One')).toBeInTheDocument();
  });

  it('derives the query from the title when no search_title is stored', async () => {
    renderWithProviders(
      <AliceNetLinkDialog
        item={makeItem({ search_title: null, title: '【中古】Clean Title 限定版' })}
        onClose={vi.fn()}
        onLinked={vi.fn()}
      />,
      { locale: 'en' },
    );
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Search VNDB...') as HTMLInputElement;
    // Used-goods + edition markers stripped, leaving the clean stem.
    expect(input.value).toBe('Clean Title');
  });

  it('links a chosen VN, toasts, and invokes onLinked + onClose', async () => {
    let linkCall: { url: string; body: unknown } | null = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return json(SEARCH_RESULTS);
      if (String(url).includes('/link') && init?.method === 'POST') {
        linkCall = { url: String(url), body: JSON.parse(String(init.body)) };
        return json({ ok: true });
      }
      return json({ ok: true });
    });
    const onClose = vi.fn();
    const onLinked = vi.fn();
    const { user } = renderWithProviders(
      <AliceNetLinkDialog item={makeItem()} onClose={onClose} onLinked={onLinked} />, { locale: 'en' },
    );
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Result One');
    await user.click(within(dialog).getAllByRole('button', { name: 'Use this' })[0]);

    await waitFor(() => expect(linkCall).not.toBeNull());
    expect(linkCall!.url).toBe('/api/alicenet/001-000001-001/link');
    expect(linkCall!.body).toEqual({ vn_id: 'v90001' });
    await waitFor(() => expect(onLinked).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Mapping saved')).toBeInTheDocument();
  });

  it('links "no match" by posting a null vn_id', async () => {
    let body: unknown = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      if (String(url).includes('/link') && init?.method === 'POST') {
        body = JSON.parse(String(init.body));
        return json({ ok: true });
      }
      return json({ ok: true });
    });
    const { user } = renderWithProviders(
      <AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />, { locale: 'en' },
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'No match' }));
    await waitFor(() => expect(body).toEqual({ vn_id: null }));
  });

  it('updates the hit list when the user types a new query', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.startsWith('/api/search')) {
        calls.push(u);
        return json(SEARCH_RESULTS);
      }
      return json({ ok: true });
    });
    const { user } = renderWithProviders(
      <AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />, { locale: 'en' },
    );
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Search VNDB...');
    await user.clear(input);
    await user.type(input, 'fresh query');
    await waitFor(() => expect(calls.some((u) => u.includes('fresh'))).toBe(true));
  });

  it('shows the empty hint when the search yields no hits', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      return json({ ok: true });
    });
    renderWithProviders(<AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={vi.fn()} />, { locale: 'en' });
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('No matches. Refine the search.')).toBeInTheDocument();
  });

  it('surfaces an error toast when the link request fails', async () => {
    const onLinked = vi.fn();
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return json(SEARCH_RESULTS);
      if (String(url).includes('/link') && init?.method === 'POST') return json({ error: 'link boom' }, 500);
      return json({ ok: true });
    });
    const { user } = renderWithProviders(
      <AliceNetLinkDialog item={makeItem()} onClose={vi.fn()} onLinked={onLinked} />, { locale: 'en' },
    );
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Result One');
    await user.click(within(dialog).getAllByRole('button', { name: 'Use this' })[0]);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('link boom');
    expect(onLinked).not.toHaveBeenCalled();
  });

  it('closes via the header close button', async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <AliceNetLinkDialog item={makeItem()} onClose={onClose} onLinked={vi.fn()} />, { locale: 'en' },
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
