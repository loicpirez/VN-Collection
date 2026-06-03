// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { CoverQuickActions } from '@/components/CoverQuickActions';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

function statusPayload(onWishlist: boolean) {
  return {
    needsAuth: false,
    labels: [{ id: 5, label: 'Wishlist', private: false }],
    entry: {
      id: 'v90001',
      added: 100,
      voted: null,
      lastmod: 100,
      vote: null,
      started: null,
      finished: null,
      notes: null,
      labels: onWishlist ? [{ id: 5, label: 'Wishlist' }] : [{ id: 1, label: 'Playing' }],
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('CoverQuickActions branches', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('in mode=all renders both the remove button and the wishlist heart when in collection', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(statusPayload(false)));
    renderWithProviders(<CoverQuickActions vnId="v90001" inCollection mode="all" />, { locale: 'en' });
    expect(screen.getByRole('button', { name: t.coverActions.removeFromCollection })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: t.coverActions.wishlist })).toBeInTheDocument());
  });

  it('in mode=tracking hides the collection toggle once the VN is already in the collection', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(statusPayload(false)));
    renderWithProviders(<CoverQuickActions vnId="v90001" inCollection mode="tracking" />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('button', { name: t.coverActions.wishlist })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: t.coverActions.addToCollection })).toBeNull();
    expect(screen.queryByRole('button', { name: t.coverActions.removeFromCollection })).toBeNull();
  });

  it('shows a loading heart while the wishlist status is in flight', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    renderWithProviders(<CoverQuickActions vnId="v90001" inCollection={false} mode="tracking" />, { locale: 'en' });
    // The heart renders during loading (disabled) before the status resolves.
    const heart = screen.getByRole('button', { name: t.coverActions.wishlist });
    expect(heart).toBeDisabled();
  });

  it('surfaces an error toast when adding to the collection fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ needsAuth: true, labels: [], entry: null }))
      .mockResolvedValueOnce(jsonResponse({ error: 'add boom' }, 500));
    global.fetch = fetchMock;
    renderWithProviders(<CoverQuickActions vnId="v90001" inCollection={false} mode="tracking" />, { locale: 'en' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.addToCollection }));
    await waitFor(() => expect(screen.getByText('add boom')).toBeInTheDocument());
  });

  it('surfaces an error toast when the wishlist toggle POST fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(statusPayload(false)))
      .mockResolvedValueOnce(jsonResponse({ error: 'wish boom' }, 500));
    global.fetch = fetchMock;
    renderWithProviders(<CoverQuickActions vnId="v90001" inCollection mode="tracking" />, { locale: 'en' });
    const heart = await screen.findByRole('button', { name: t.coverActions.wishlist });
    fireEvent.click(heart);
    await waitFor(() => expect(screen.getByText('wish boom')).toBeInTheDocument());
  });

  it('surfaces an error toast when the remove DELETE fails after confirm', async () => {
    const fetchMock = vi.fn((url: string, init: RequestInit = {}) => {
      if (init.method === 'DELETE') return Promise.resolve(jsonResponse({ error: 'remove boom' }, 500));
      return Promise.resolve(jsonResponse(statusPayload(false)));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { user } = renderWithProviders(<CoverQuickActions vnId="v90001" inCollection mode="danger" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.removeFromCollection }));
    await user.click(await screen.findByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(screen.getByText('remove boom')).toBeInTheDocument());
  });

  it('hides the wishlist heart when the status fetch rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock;
    renderWithProviders(<CoverQuickActions vnId="v90001" inCollection={false} mode="tracking" />, { locale: 'en' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('button', { name: t.coverActions.wishlist })).toBeNull());
    expect(screen.getByRole('button', { name: t.coverActions.addToCollection })).toBeInTheDocument();
  });

  it('hides the wishlist heart when the status response is non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));
    global.fetch = fetchMock;
    renderWithProviders(<CoverQuickActions vnId="v90001" inCollection mode="tracking" />, { locale: 'en' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('button', { name: t.coverActions.wishlist })).toBeNull());
  });

  it('adds to the collection successfully from mode=all when not yet owned', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(statusPayload(false)))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    global.fetch = fetchMock;
    renderWithProviders(<CoverQuickActions vnId="v90001" inCollection={false} mode="all" />, { locale: 'en' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.addToCollection }));
    await waitFor(() => expect(screen.getByText(t.toast.added)).toBeInTheDocument());
  });
});
