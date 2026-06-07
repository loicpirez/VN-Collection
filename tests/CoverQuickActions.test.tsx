// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const t = dictionaries.fr;

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

describe('CoverQuickActions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders only the Add button for a synthetic egs_* VN (wishlist unsupported)', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({}));
    renderWithProviders(<CoverQuickActions vnId="egs_42" inCollection={false} />);
    await waitFor(() => expect(screen.getByRole('button', { name: t.coverActions.addToCollection })).toBeTruthy());
    // No wishlist heart for synthetic VNs.
    expect(screen.queryByRole('button', { name: t.coverActions.wishlist })).toBeNull();
    expect((global.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('hides the wishlist heart when the status response needs auth', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ needsAuth: true, labels: [], entry: null }));
    renderWithProviders(<CoverQuickActions vnId="v90001" inCollection={false} />);
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('button', { name: t.coverActions.wishlist })).toBeNull());
    expect(screen.getByRole('button', { name: t.coverActions.addToCollection })).toBeTruthy();
  });

  it('POSTs to add the VN to the collection', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ needsAuth: true, labels: [], entry: null }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    global.fetch = fetchMock;
    renderWithProviders(<CoverQuickActions vnId="v90001" inCollection={false} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.addToCollection }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/collection/v90001');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ status: 'planning' });
  });

  it('shows the wishlist heart pressed when label 5 is set and toggles it off via DELETE', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(statusPayload(true)))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    global.fetch = fetchMock;
    renderWithProviders(<CoverQuickActions vnId="v90001" inCollection mode="tracking" />);
    // Accessible name is the visible label (wishlisted); the title carries unwish.
    const heart = await screen.findByRole('button', { name: t.coverActions.wishlisted });
    expect(heart.getAttribute('aria-pressed')).toBe('true');
    expect(heart.getAttribute('title')).toBe(t.coverActions.unwish);
    fireEvent.click(heart);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/wishlist/v90001');
    expect(init.method).toBe('DELETE');
  });

  it('adds to wishlist via POST when label 5 is not set', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(statusPayload(false)))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    global.fetch = fetchMock;
    renderWithProviders(<CoverQuickActions vnId="v90001" inCollection mode="tracking" />);
    const heart = await screen.findByRole('button', { name: t.coverActions.wishlist });
    await waitFor(() => expect((heart as HTMLButtonElement).disabled).toBe(false));
    expect(heart.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(heart);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
  });

  it('in danger mode renders only the Remove button and DELETEs after confirm', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(statusPayload(false)))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<CoverQuickActions vnId="v90001" inCollection mode="danger" />);
    // danger mode hides the wishlist heart.
    expect(screen.queryByRole('button', { name: t.coverActions.wishlist })).toBeNull();
    const remove = screen.getByRole('button', { name: t.coverActions.removeFromCollection });
    fireEvent.click(remove);
    // Confirm dialog appears; click its confirm button.
    const confirmBtn = await screen.findByRole('button', { name: t.common.confirm });
    await user.click(confirmBtn);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001' && c[1]?.method === 'DELETE')).toBe(true));
  });

  it('cancelling the remove confirm performs no DELETE', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(statusPayload(false)));
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<CoverQuickActions vnId="v90001" inCollection mode="danger" />);
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.removeFromCollection }));
    const cancelBtn = await screen.findByRole('button', { name: t.common.cancel });
    await user.click(cancelBtn);
    await waitFor(() => expect(screen.queryByRole('button', { name: t.common.cancel })).toBeNull());
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false);
  });
});
