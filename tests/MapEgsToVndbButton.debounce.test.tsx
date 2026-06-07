// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { MapEgsToVndbButton } from '@/components/MapEgsToVndbButton';

const refresh = vi.fn();
const debounceState = vi.hoisted(() => ({
  queued: [] as Array<() => void>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hooks')>();
  return {
    ...actual,
    useDebouncedCallback: <TArgs extends unknown[]>(fn: (...args: TArgs) => void) => (...args: TArgs) => {
      debounceState.queued.push(() => fn(...args));
    },
  };
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('MapEgsToVndbButton debounced search ownership', () => {
  beforeEach(() => {
    refresh.mockClear();
    debounceState.queued = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      return json({ link: null });
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('drops a queued search when the component identity changes before it runs', async () => {
    const view = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    fireEvent.click(view.getByRole('button', { name: 'Map to VNDB' }));
    await waitFor(() => expect(debounceState.queued).toHaveLength(1));

    view.rerender(<MapEgsToVndbButton egsId={123} gamename="Different Name" vndbId={null} />);
    debounceState.queued[0]!();

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => String(url).startsWith('/api/search'))).toHaveLength(0);
  });
});
