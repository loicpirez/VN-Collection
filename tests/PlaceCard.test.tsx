// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceCard } from '@/components/PlaceCard';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { PlaceWithLinks } from '@/lib/db';
import { renderWithProviders } from './helpers/render-component';

const confirmMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@/components/ConfirmDialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ConfirmDialog')>();
  return {
    ...actual,
    useConfirm: () => confirmMocks,
  };
});

vi.mock('@/components/ToastProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ToastProvider')>();
  return {
    ...actual,
    useToast: () => toastMocks,
  };
});

const t = dictionaries.en;
const DAY = 86_400_000;

function jsonResponse(payload: unknown = { ok: true }, status = 200): Response {
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

function place(overrides: Partial<PlaceWithLinks> = {}): PlaceWithLinks {
  return {
    id: 1,
    name: 'Tokyo Shop',
    name_ja: null,
    kind: 'shop',
    address: null,
    lat: null,
    lng: null,
    url: null,
    notes: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    provider_labels: [],
    stock_count: 0,
    ...overrides,
  };
}

function callbacks() {
  return {
    onAssign: vi.fn(),
    onDelete: vi.fn(),
    onEdit: vi.fn(),
  };
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  confirmMocks.confirm.mockReset();
  confirmMocks.confirm.mockResolvedValue(true);
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PlaceCard', () => {
  it('renders a minimal shop and invokes the edit and assign callbacks', () => {
    const actions = callbacks();
    renderWithProviders(<PlaceCard place={place()} {...actions} />, { locale: 'en' });
    expect(screen.getByText('Tokyo Shop')).toBeInTheDocument();
    expect(screen.getByText(t.places.noCoords)).toBeInTheDocument();
    expect(screen.getByText(t.places.noStock)).toBeInTheDocument();
    expect(screen.getByText(t.places.kindShop)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: t.places.urlPlaceholder })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: t.places.viewOnMap })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: t.places.openPlace })).toHaveAttribute('href', '/places/1');

    fireEvent.click(screen.getByRole('button', { name: t.places.assignDialog }));
    fireEvent.click(screen.getByRole('button', { name: t.places.editPlace }));
    expect(actions.onAssign).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(actions.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('renders GPS, URL, Japanese name, stock, linked branches, stale age, and each kind', () => {
    const actions = callbacks();
    const rendered = renderWithProviders(
      <PlaceCard
        place={place({
          name_ja: '東京店',
          kind: 'chain',
          address: '1 Chiyoda',
          lat: 35,
          lng: 139,
          url: ' https://example.com/shop ',
          updated_at: Date.now() - 8 * DAY,
          provider_labels: ['Tokyo', 'Akiba'],
          stock_count: 3,
        })}
        {...actions}
      />,
      { locale: 'en' },
    );
    expect(screen.getByText('東京店')).toBeInTheDocument();
    expect(screen.getByText('1 Chiyoda')).toBeInTheDocument();
    expect(screen.getByText('GPS')).toBeInTheDocument();
    expect(screen.getByText('3 VN in stock')).toBeInTheDocument();
    expect(screen.getByText('2 branch(es)')).toBeInTheDocument();
    expect(screen.getByText('Stale (8d)')).toBeInTheDocument();
    expect(screen.getByText(t.places.kindChain)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t.places.urlPlaceholder })).toHaveAttribute('href', 'https://example.com/shop');
    expect(screen.getByRole('link', { name: t.places.viewOnMap })).toHaveAttribute('href', '/map?place=1');

    rendered.rerender(<PlaceCard place={place({ id: 2, kind: 'storage', updated_at: Date.now() - DAY, url: 'javascript:alert(1)' })} {...actions} />);
    expect(screen.getByText(t.places.kindStorage)).toBeInTheDocument();
    expect(screen.queryByText(/Stale/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: t.places.urlPlaceholder })).not.toBeInTheDocument();
  });

  it('cancels deletion and locks duplicate confirmation clicks', async () => {
    const confirmation = deferred<boolean>();
    confirmMocks.confirm.mockReturnValueOnce(confirmation.promise);
    const actions = callbacks();
    renderWithProviders(<PlaceCard place={place()} {...actions} />, { locale: 'en' });
    const destroy = screen.getByRole('button', { name: t.places.deletePlace });
    act(() => {
      destroy.click();
      destroy.click();
    });
    expect(confirmMocks.confirm).toHaveBeenCalledTimes(1);
    await act(async () => confirmation.resolve(false));
    expect(fetch).not.toHaveBeenCalled();
    expect(destroy).toBeEnabled();
  });

  it('deletes a place and reports HTTP and network failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse())
      .mockResolvedValueOnce(jsonResponse({ error: 'delete failed' }, 500))
      .mockRejectedValueOnce(new Error('network failed'));
    const actions = callbacks();
    renderWithProviders(<PlaceCard place={place()} {...actions} />, { locale: 'en' });
    const destroy = screen.getByRole('button', { name: t.places.deletePlace });

    fireEvent.click(destroy);
    await flushAsync();
    expect(fetch).toHaveBeenLastCalledWith('/api/places/1', expect.objectContaining({ method: 'DELETE' }));
    expect(toastMocks.success).toHaveBeenCalledWith(t.places.deleteSuccess);
    expect(actions.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    fireEvent.click(destroy);
    await flushAsync();
    expect(toastMocks.error).toHaveBeenLastCalledWith('delete failed');
    fireEvent.click(destroy);
    await flushAsync();
    expect(toastMocks.error).toHaveBeenLastCalledWith('network failed');
  });

  it('aborts and ignores obsolete deletion work after identity changes or teardown', async () => {
    const actions = callbacks();
    const confirmation = deferred<boolean>();
    confirmMocks.confirm.mockReturnValueOnce(confirmation.promise);
    const first = renderWithProviders(<PlaceCard place={place()} {...actions} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.places.deletePlace }));
    first.rerender(<PlaceCard place={place({ id: 2 })} {...actions} />);
    await act(async () => confirmation.resolve(true));
    expect(fetch).not.toHaveBeenCalled();

    const success = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(success.promise);
    fireEvent.click(screen.getByRole('button', { name: t.places.deletePlace }));
    await flushAsync();
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    first.rerender(<PlaceCard place={place({ id: 3 })} {...actions} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => success.resolve(jsonResponse()));
    expect(actions.onDelete).not.toHaveBeenCalled();

    const failure = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(failure.promise);
    fireEvent.click(screen.getByRole('button', { name: t.places.deletePlace }));
    await flushAsync();
    first.unmount();
    await act(async () => failure.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
