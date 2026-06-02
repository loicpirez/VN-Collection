// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuotesSection } from '@/components/QuotesSection';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const sectionMocks = vi.hoisted(() => ({
  count: vi.fn(),
}));

vi.mock('@/components/vn-detail/DetailSectionFrame', () => ({
  useSectionCount: sectionMocks.count,
}));

vi.mock('@/components/Skeleton', () => ({
  SkeletonBlock: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

vi.mock('@/components/ErrorAlert', () => ({
  ErrorAlert: ({ children, title }: { children: React.ReactNode; title: string }) => <div>{`${title}: ${children}`}</div>,
}));

vi.mock('@/components/QuoteAvatar', () => ({
  QuoteAvatar: ({ size }: { size: number }) => <div>{`avatar:${size}`}</div>,
}));

vi.mock('@/components/VndbMarkup', () => ({
  VndbMarkup: ({ text }: { text: string }) => <span>{text}</span>,
}));

const t = dictionaries.en;

function jsonResponse(payload: unknown, status = 200): Response {
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

function quote(id: string, character: { id: string; name: string; original: string | null } | null) {
  return {
    id,
    quote: `Quote ${id}`,
    score: 1,
    vn: null,
    character,
  };
}

beforeEach(() => {
  sectionMocks.count.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('QuotesSection', () => {
  it('shows skeletons while loading and an empty state after an empty response', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    renderWithProviders(<QuotesSection vnId="v90001" />, { locale: 'en' });

    expect(screen.getAllByTestId('skeleton')).toHaveLength(9);
    await act(async () => pending.resolve(jsonResponse({ quotes: [] })));
    expect(await screen.findByText(t.quotes.empty)).toBeInTheDocument();
    expect(sectionMocks.count).toHaveBeenCalledWith(0);
  });

  it('renders decoded quotes with optional character citations and originals', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      quotes: [
        quote('q1', null),
        quote('q2', { id: 'c90001', name: 'Character', original: 'Original' }),
        quote('q3', { id: 'c90002', name: 'Second', original: null }),
      ],
    }));
    renderWithProviders(<QuotesSection vnId="v90001" />, { locale: 'en' });

    expect(await screen.findByText('Quote q1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '- Character / Original' })).toHaveAttribute('href', '/character/c90001');
    expect(screen.getByRole('link', { name: '- Second' })).toHaveAttribute('href', '/character/c90002');
    expect(screen.getAllByText('avatar:28')).toHaveLength(2);
    expect(sectionMocks.count).toHaveBeenCalledWith(3);
  });

  it('reports HTTP and malformed-payload errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'quote load failed' }, 500));
    const { rerender } = renderWithProviders(<QuotesSection vnId="v90001" />, { locale: 'en' });
    expect(await screen.findByText(`${t.common.error}: quote load failed`)).toBeInTheDocument();

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ quotes: 'invalid' }));
    rerender(<QuotesSection vnId="v90002" />);
    expect(await screen.findByText(`${t.common.error}: ${t.common.error}`)).toBeInTheDocument();
  });

  it('ignores stale successful responses after the VN changes', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(jsonResponse({ quotes: [] }));
    const { rerender } = renderWithProviders(<QuotesSection vnId="v90001" />, { locale: 'en' });

    rerender(<QuotesSection vnId="v90002" />);
    await act(async () => pending.resolve(jsonResponse({ quotes: [quote('q1', null)] })));
    expect(screen.queryByText('Quote q1')).toBeNull();
  });

  it('ignores abort and stale non-abort rejections', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    vi.mocked(fetch).mockRejectedValueOnce(abortError);
    const { rerender } = renderWithProviders(<QuotesSection vnId="v90001" />, { locale: 'en' });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(`${t.common.error}: aborted`)).toBeNull();

    const pending = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(jsonResponse({ quotes: [] }));
    rerender(<QuotesSection vnId="v90002" />);
    rerender(<QuotesSection vnId="v90003" />);
    await act(async () => pending.reject(new Error('late error')));
    expect(screen.queryByText(`${t.common.error}: late error`)).toBeNull();
  });
});
