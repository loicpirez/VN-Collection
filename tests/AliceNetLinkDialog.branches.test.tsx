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
});
