// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TraitsBrowser } from '@/components/TraitsBrowser';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigationMocks.replace }),
  useSearchParams: () => navigationMocks.search,
}));

vi.mock('@/components/RefreshScopeButton', () => ({
  RefreshScopeButton: ({ lastUpdatedAt, scope }: { lastUpdatedAt: number | null; scope: string }) => (
    <span>{`refresh:${scope}:${lastUpdatedAt ?? 'none'}`}</span>
  ),
}));

vi.mock('@/components/CardDensitySlider', () => ({
  CardDensitySlider: ({ scope }: { scope: string }) => <span>{`density:${scope}`}</span>,
}));

vi.mock('@/components/DensityScopeProvider', () => ({
  DensityScopeProvider: ({ children, scope }: { children: React.ReactNode; scope: string }) => (
    <div data-density-scope={scope}>{children}</div>
  ),
}));

vi.mock('@/components/Skeleton', () => ({
  SkeletonRows: ({ count, withThumb }: { count: number; withThumb: boolean }) => <span>{`skeleton:${count}:${withThumb}`}</span>,
}));

const t = dictionaries.en;

function jsonResponse(payload: unknown = { traits: [] }, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: Error) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason?: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function trait(overrides: Partial<{
  id: string;
  name: string;
  aliases: string[];
  description: string | null;
  searchable: boolean;
  applicable: boolean;
  sexual: boolean;
  group_id: string | null;
  group_name: string | null;
  char_count: number;
}> = {}) {
  return {
    id: 'i1',
    name: 'Trait',
    aliases: [],
    description: null,
    searchable: true,
    applicable: true,
    sexual: false,
    group_id: null,
    group_name: null,
    char_count: 1,
    ...overrides,
  };
}

async function runTimers(ms = 0) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  navigationMocks.replace.mockReset();
  navigationMocks.search = new URLSearchParams();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TraitsBrowser', () => {
  it('renders loading then decoded cards with optional metadata', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      traits: [
        trait({
          id: 'I1',
          name: 'First',
          group_id: 'I2',
          group_name: 'Group',
          description: '[b]Description[/b]',
          sexual: true,
          char_count: 1200,
        }),
        trait({ id: 'i3', name: 'Second' }),
      ],
    }));
    renderWithProviders(<TraitsBrowser lastUpdatedAt={12} />, { locale: 'en' });
    expect(screen.getByText('skeleton:8:false')).toBeInTheDocument();
    await runTimers();

    expect(fetch).toHaveBeenCalledWith('/api/traits?q=&results=60', expect.objectContaining({ cache: 'no-store' }));
    expect(screen.getByRole('link', { name: /Group \/First/ })).toHaveAttribute('href', '/trait/i1');
    expect(screen.getByText('R18')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText(`refresh:traits-list:12`)).toBeInTheDocument();
    expect(screen.getByText('density:traitsList')).toBeInTheDocument();
  });

  it('renders the resolved empty state and toggles collection-only mode in the URL', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    renderWithProviders(<TraitsBrowser />, { locale: 'en' });
    await runTimers();
    expect(screen.getByText(t.traits.emptyTitle)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.library.filterMine }));
    expect(navigationMocks.replace).toHaveBeenCalledWith('/traits?mine=1', { scroll: false });
  });

  it('fetches collection traits and filters them locally by name, group, or alias', async () => {
    navigationMocks.search = new URLSearchParams('mine=1&q=needle');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      traits: [
        trait({ id: 'i1', name: 'Needle name' }),
        trait({ id: 'i2', name: 'Second', group_name: 'Needle group' }),
        trait({ id: 'i3', name: 'Third', aliases: ['needle alias'] }),
        trait({ id: 'i4', name: 'Hidden' }),
      ],
    }));
    renderWithProviders(<TraitsBrowser />, { locale: 'en' });
    await runTimers();

    expect(fetch).toHaveBeenCalledWith('/api/collection/traits', expect.objectContaining({ cache: 'no-store' }));
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByRole('link', { name: 'Hidden' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.library.filterMine }));
    expect(navigationMocks.replace).toHaveBeenCalledWith('/traits?q=needle', { scroll: false });
  });

  it('debounces trimmed URL search commits and resynchronizes external search values', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    const { rerender } = renderWithProviders(<TraitsBrowser />, { locale: 'en' });
    await runTimers();
    const input = screen.getByRole('textbox', { name: t.traits.searchPlaceholder });
    fireEvent.change(input, { target: { value: '  next  ' } });
    await runTimers(299);
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    await runTimers(1);
    expect(navigationMocks.replace).toHaveBeenCalledWith('/traits?q=next', { scroll: false });

    navigationMocks.replace.mockReset();
    navigationMocks.search = new URLSearchParams('q=external');
    rerender(<TraitsBrowser />);
    expect(input).toHaveValue('external');
    await runTimers(300);
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it('removes the final query parameter when the search input is cleared', async () => {
    navigationMocks.search = new URLSearchParams('q=existing');
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    renderWithProviders(<TraitsBrowser />, { locale: 'en' });
    await runTimers();

    fireEvent.change(screen.getByRole('textbox', { name: t.traits.searchPlaceholder }), { target: { value: '' } });
    await runTimers(300);
    expect(navigationMocks.replace).toHaveBeenCalledWith('/traits', { scroll: false });
  });

  it('reports HTTP, malformed-payload, and network failures while ignoring AbortError', async () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'load failed' }, 500))
      .mockResolvedValueOnce(jsonResponse({ traits: 'invalid' }))
      .mockRejectedValueOnce(new Error('network failed'))
      .mockRejectedValueOnce(aborted);

    const first = renderWithProviders(<TraitsBrowser />, { locale: 'en' });
    await runTimers();
    expect(screen.getByRole('alert')).toHaveTextContent('load failed');
    first.unmount();

    const second = renderWithProviders(<TraitsBrowser />, { locale: 'en' });
    await runTimers();
    expect(screen.getByRole('alert')).toHaveTextContent(t.common.error);
    second.unmount();

    const third = renderWithProviders(<TraitsBrowser />, { locale: 'en' });
    await runTimers();
    expect(screen.getByRole('alert')).toHaveTextContent('network failed');
    third.unmount();

    renderWithProviders(<TraitsBrowser />, { locale: 'en' });
    await runTimers();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('aborts and ignores stale responses after query navigation', async () => {
    const first = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(jsonResponse());
    const mounted = renderWithProviders(<TraitsBrowser />, { locale: 'en' });
    await runTimers();
    const firstSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    navigationMocks.search = new URLSearchParams('q=other');
    mounted.rerender(<TraitsBrowser />);
    expect(firstSignal?.aborted).toBe(true);
    await runTimers();
    expect(screen.getByText(t.traits.emptyTitle)).toBeInTheDocument();

    await act(async () => first.resolve(jsonResponse({ traits: [trait({ name: 'Stale' })] })));
    expect(screen.queryByText('Stale')).not.toBeInTheDocument();
  });

  it('ignores a non-abort failure from a stale request after query navigation', async () => {
    const first = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(jsonResponse());
    const mounted = renderWithProviders(<TraitsBrowser />, { locale: 'en' });
    await runTimers();

    navigationMocks.search = new URLSearchParams('q=other');
    mounted.rerender(<TraitsBrowser />);
    await runTimers();
    expect(screen.getByText(t.traits.emptyTitle)).toBeInTheDocument();

    await act(async () => first.reject(new Error('late failure')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
