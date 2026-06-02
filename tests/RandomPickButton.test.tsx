// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { RandomPickButton } from '@/components/RandomPickButton';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/**
 * One bounded collection page in the exact shape `decodeCollectionPage`
 * + `decodeCollectionCompareRow` accept: positive page, page_size,
 * returned === items.length, has_more boolean, each row a valid v-id.
 */
function pageResponse(rows: { id: string; title: string }[], hasMore = false, page = 1) {
  return new Response(
    JSON.stringify({
      items: rows.map((r) => ({ id: r.id, title: r.title, alttitle: null, released: null })),
      pagination: { page, page_size: 500, returned: rows.length, has_more: hasMore },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

beforeEach(() => {
  pushMock.mockReset();
  Math.random = () => 0; // deterministic pick → index 0
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RandomPickButton', () => {
  it('is disabled with the empty title when there are no candidates', () => {
    renderWithProviders(<RandomPickButton candidates={[]} queryParams={new URLSearchParams()} />, { locale: 'en' });
    const btn = screen.getByRole('button', { name: /Random/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', expect.stringContaining('No VN matches'));
  });

  it('fetches the full filtered set and navigates to the chosen VN', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      pageResponse([
        { id: 'v90001', title: 'Title Y' },
        { id: 'v90002', title: 'Title Z' },
      ]),
    );
    const { user } = renderWithProviders(
      <RandomPickButton
        candidates={[{ id: 'v90009', title: 'Loaded Page Only' }]}
        queryParams={new URLSearchParams('status=completed')}
      />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: /Random/ }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/vn/v90001'));
    expect(screen.getByText(/Random pick - Title Y/)).toBeInTheDocument();
  });

  it('falls back to the loaded-page candidates when the full fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    const { user } = renderWithProviders(
      <RandomPickButton
        candidates={[{ id: 'v90042', title: 'Fallback Title' }]}
        queryParams={new URLSearchParams()}
      />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: /Random/ }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/vn/v90042'));
    expect(screen.getByText(/Random pick - Fallback Title/)).toBeInTheDocument();
  });

  it('keeps the loaded-page candidates when the fetch resolves an empty set', async () => {
    global.fetch = vi.fn().mockResolvedValue(pageResponse([]));
    const { user } = renderWithProviders(
      <RandomPickButton
        candidates={[{ id: 'v90100', title: 'Only Candidate' }]}
        queryParams={new URLSearchParams()}
      />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: /Random/ }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/vn/v90100'));
  });
});
