// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import type { PlaceWithLinks } from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';

const pushMock = vi.fn();
const refreshMock = vi.fn();
let latestEditSaved: (() => void) | null = null;
let latestAssignSaved: (() => void) | null = null;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: refreshMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** Stub the heavy children so the test isolates PlaceDetailClient. */
vi.mock('@/components/PlaceVnBrowser', () => ({
  PlaceVnBrowser: ({ placeId }: { placeId: number }) => <div data-testid="vn-browser">{placeId}</div>,
}));
vi.mock('@/components/AddEditPlaceModal', () => ({
  AddEditPlaceModal: ({ onClose, onSaved }: { onClose: () => void; onSaved: (id?: number) => void }) => {
    latestEditSaved = () => onSaved();
    return (
      <div data-testid="edit-modal">
        <button type="button" onClick={onClose}>close-edit</button>
        <button type="button" onClick={() => onSaved()}>save-edit</button>
      </div>
    );
  },
}));
vi.mock('@/components/AssignProviderDialog', () => ({
  AssignProviderDialog: ({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) => {
    latestAssignSaved = onSaved;
    return (
      <div data-testid="assign-dialog">
        <button type="button" onClick={onClose}>close-assign</button>
        <button type="button" onClick={onSaved}>save-assign</button>
      </div>
    );
  },
}));
vi.mock('@/components/AliceNetClient', () => ({
  AliceNetClient: ({ embedded, basePath }: { embedded?: boolean; basePath?: string }) => (
    <div data-testid="alicenet-client" data-embedded={String(embedded)} data-base-path={basePath ?? ''} />
  ),
}));

const t = dictionaries.en;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function place(overrides: Partial<PlaceWithLinks> = {}): PlaceWithLinks {
  return {
    id: 12,
    name: 'Detail Shop',
    name_ja: 'ディテール',
    kind: 'shop',
    address: '4-5-6 Avenue',
    lat: 35.6,
    lng: 139.7,
    url: 'https://example.test/shop',
    notes: 'Some notes here',
    created_at: 1,
    updated_at: 1,
    provider_labels: ['Branch A'],
    stock_count: 0,
    ...overrides,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('PlaceDetailClient branches', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    latestEditSaved = null;
    latestAssignSaved = null;
    global.fetch = vi.fn(async () => json({ ok: true }));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders all optional sections when fully populated', async () => {
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    renderWithProviders(<PlaceDetailClient place={place()} />, { locale: 'en' });
    expect(screen.getByRole('heading', { name: 'Detail Shop' })).toBeInTheDocument();
    expect(screen.getByText('ディテール')).toBeInTheDocument();
    expect(screen.getByText('4-5-6 Avenue')).toBeInTheDocument();
    expect(screen.getByText('Some notes here')).toBeInTheDocument();
    // Website link uses the safe href.
    const link = screen.getByRole('link', { name: t.places.urlPlaceholder as string });
    expect(link).toHaveAttribute('href', 'https://example.test/shop');
    // View-on-map link exists because GPS is present.
    expect(screen.getByRole('link', { name: t.places.viewOnMap as string })).toHaveAttribute('href', '/map?place=12');
    expect(screen.getByTestId('vn-browser')).toHaveTextContent('12');
  });

  it('hides GPS-dependent UI and shows the no-coords badge without coordinates', async () => {
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    renderWithProviders(
      <PlaceDetailClient place={place({ lat: null, lng: null, name_ja: null, address: null, notes: null })} />,
      { locale: 'en' },
    );
    expect(screen.queryByRole('link', { name: t.places.viewOnMap as string })).toBeNull();
    expect(screen.getByText(t.places.noCoords as string)).toBeInTheDocument();
    // No name_ja / address / notes sections.
    expect(screen.queryByText('ディテール')).toBeNull();
  });

  it('omits the website link when the url is unsafe', async () => {
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    renderWithProviders(
      <PlaceDetailClient place={place({ url: 'javascript:alert(1)' })} />,
      { locale: 'en' },
    );
    expect(screen.queryByRole('link', { name: t.places.urlPlaceholder as string })).toBeNull();
  });

  it('opens and closes the edit modal, refreshing on save', async () => {
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    const { user } = renderWithProviders(<PlaceDetailClient place={place()} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: new RegExp(t.places.editPlace as string) }));
    expect(screen.getByTestId('edit-modal')).toBeInTheDocument();

    await user.click(screen.getByText('save-edit'));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('edit-modal')).toBeNull());

    await user.click(screen.getByRole('button', { name: new RegExp(t.places.editPlace as string) }));
    await user.click(screen.getByText('close-edit'));
    await waitFor(() => expect(screen.queryByTestId('edit-modal')).toBeNull());
  });

  it('opens and closes the assign dialog, refreshing on save', async () => {
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    const { user } = renderWithProviders(<PlaceDetailClient place={place()} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: new RegExp(t.places.assignDialog as string) }));
    expect(screen.getByTestId('assign-dialog')).toBeInTheDocument();

    await user.click(screen.getByText('save-assign'));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());

    await user.click(screen.getByText('close-assign'));
    await waitFor(() => expect(screen.queryByTestId('assign-dialog')).toBeNull());
  });

  it('deletes the place after confirmation and navigates back', async () => {
    const calls: { url: string; method?: string }[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      return json({ ok: true });
    });
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    const { user } = renderWithProviders(<PlaceDetailClient place={place()} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: new RegExp(t.places.deletePlace as string) }));

    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/places'));
    expect(calls[0].url).toBe('/api/places/12');
    expect(calls[0].method).toBe('DELETE');
    // Success toast surfaces.
    expect(await screen.findByText(t.places.deleteSuccess as string)).toBeInTheDocument();
  });

  it('does not delete when the confirmation is cancelled', async () => {
    const fetchSpy = vi.fn(async () => json({ ok: true }));
    global.fetch = fetchSpy;
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    const { user } = renderWithProviders(<PlaceDetailClient place={place()} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: new RegExp(t.places.deletePlace as string) }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('ignores rapid duplicate delete attempts while the first confirmation is pending', async () => {
    const fetchSpy = vi.fn(async () => json({ ok: true }));
    global.fetch = fetchSpy;
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    renderWithProviders(<PlaceDetailClient place={place()} />, { locale: 'en' });
    const deleteButton = screen.getByRole('button', { name: new RegExp(t.places.deletePlace as string) });
    act(() => {
      deleteButton.click();
      deleteButton.click();
    });
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('drops a confirmed delete when the place identity changed before confirmation resolves', async () => {
    const fetchSpy = vi.fn(async () => json({ ok: true }));
    global.fetch = fetchSpy;
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    const { user, rerender } = renderWithProviders(<PlaceDetailClient place={place()} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: new RegExp(t.places.deletePlace as string) }));
    await screen.findByRole('alertdialog');
    rerender(<PlaceDetailClient place={place({ id: 13, name: 'Second Shop' })} />);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('drops a successful delete response when the place identity changed mid-request', async () => {
    let resolveDelete: (response: Response) => void = () => {};
    const fetchSpy = vi.fn(() => new Promise<Response>((resolve) => { resolveDelete = resolve; }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    const { user, rerender } = renderWithProviders(<PlaceDetailClient place={place()} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: new RegExp(t.places.deletePlace as string) }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    rerender(<PlaceDetailClient place={place({ id: 14, name: 'Third Shop' })} />);
    resolveDelete(json({ ok: true }));
    await flushMicrotasks();
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.queryByText(t.places.deleteSuccess as string)).toBeNull();
  });

  it('drops a failed delete response when the place identity changed mid-request', async () => {
    let resolveDelete: (response: Response) => void = () => {};
    const fetchSpy = vi.fn(() => new Promise<Response>((resolve) => { resolveDelete = resolve; }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    const { user, rerender } = renderWithProviders(<PlaceDetailClient place={place()} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: new RegExp(t.places.deletePlace as string) }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    rerender(<PlaceDetailClient place={place({ id: 15, name: 'Fourth Shop' })} />);
    resolveDelete(json({ error: 'stale delete failed' }, 500));
    await flushMicrotasks();
    expect(screen.queryByText('stale delete failed')).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows an error toast when the delete request fails', async () => {
    global.fetch = vi.fn(async () => json({ error: 'delete failed' }, 500));
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    const { user } = renderWithProviders(<PlaceDetailClient place={place()} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: new RegExp(t.places.deletePlace as string) }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('delete failed')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('ignores stale edit and assign save callbacks after the place changes', async () => {
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    const { user, rerender } = renderWithProviders(<PlaceDetailClient place={place()} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: new RegExp(t.places.editPlace as string) }));
    expect(latestEditSaved).not.toBeNull();
    const staleEditSaved = latestEditSaved;
    rerender(<PlaceDetailClient place={place({ id: 16, name: 'Fifth Shop' })} />);
    act(() => staleEditSaved?.());
    expect(refreshMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: new RegExp(t.places.assignDialog as string) }));
    expect(latestAssignSaved).not.toBeNull();
    const staleAssignSaved = latestAssignSaved;
    rerender(<PlaceDetailClient place={place({ id: 17, name: 'Sixth Shop' })} />);
    act(() => staleAssignSaved?.());
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('swaps the place browser for the AliceNet browser on the AliceNet shop', async () => {
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    const { rerender } = renderWithProviders(<PlaceDetailClient place={place()} />, { locale: 'en' });
    expect(screen.queryByTestId('alicenet-client')).toBeNull();
    expect(screen.getByTestId('vn-browser')).toBeInTheDocument();
    rerender(<PlaceDetailClient place={place({ id: 21, provider_labels: ['AliceNet'] })} />);
    const browser = screen.getByTestId('alicenet-client');
    expect(browser.getAttribute('data-embedded')).toBe('true');
    expect(browser.getAttribute('data-base-path')).toBe('/places/21');
    expect(screen.queryByTestId('vn-browser')).toBeNull();
  });

  it('falls back to the raw kind when no localized label exists', async () => {
    const { PlaceDetailClient } = await import('@/components/PlaceDetailClient');
    renderWithProviders(
      // Cast through unknown to force an unmapped kind value for the fallback branch.
      <PlaceDetailClient place={place({ kind: 'depot' as unknown as PlaceWithLinks['kind'] })} />,
      { locale: 'en' },
    );
    expect(screen.getByText('depot')).toBeInTheDocument();
  });
});
