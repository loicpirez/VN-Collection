// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { MapVnToEgsButton } from '@/components/MapVnToEgsButton';

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

describe('MapVnToEgsButton debounced search ownership', () => {
  beforeEach(() => {
    refresh.mockClear();
    debounceState.queued = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/egs/search')) return json({ candidates: [] });
      return json({ game: null, manual: null, source: null });
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('drops a queued search when the component identity changes before it runs', async () => {
    const view = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    fireEvent.click(view.getByRole('button', { name: 'Map to EGS' }));
    await waitFor(() => expect(debounceState.queued).toHaveLength(1));

    view.rerender(<MapVnToEgsButton vnId="v90001" seedQuery="Different Name" />);
    debounceState.queued[0]!();

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => String(url).startsWith('/api/egs/search'))).toHaveLength(0);
  });

  it('clears a queued blank query without issuing an EGS search request', async () => {
    const view = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    fireEvent.click(view.getByRole('button', { name: 'Map to EGS' }));
    await screen.findByRole('dialog');
    await waitFor(() => expect(debounceState.queued).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('Search EGS...'), { target: { value: '   ' } });
    await waitFor(() => expect(debounceState.queued.length).toBeGreaterThan(1));
    debounceState.queued[debounceState.queued.length - 1]!();

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => String(url).startsWith('/api/egs/search'))).toHaveLength(0);
  });
});
