// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { ShelfReadOnlyControls } from '@/components/ShelfReadOnlyControls';
import { defaultShelfViewPrefsV1, SHELF_DISPLAY_OVERRIDES_EVENT, SHELF_VIEW_PREFS_EVENT } from '@/lib/shelf-view-prefs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const TRIGGER = "Options d'affichage de l'étagère";

function okFetch() {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

function open() {
  fireEvent.click(screen.getByRole('button', { name: TRIGGER }));
}

async function waitForFetchCount(fetchMock: ReturnType<typeof okFetch>, count: number) {
  await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(count));
}

describe('ShelfReadOnlyControls branches', () => {
  beforeEach(() => {
    global.fetch = okFetch() as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes the popover on an outside mousedown', () => {
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    expect(screen.getByRole('region', { name: TRIGGER })).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('region', { name: TRIGGER })).toBeNull();
  });

  it('closes the popover via the header close button', () => {
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    fireEvent.click(within(region).getByRole('button', { name: /Fermer/ }));
    expect(screen.queryByRole('region', { name: TRIGGER })).toBeNull();
  });

  it('shows the override badge once a per-shelf slider write creates an override', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(
      <ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} activeShelfId="42" activeShelfName="Studio X" />,
    );
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    // Switch to the per-shelf scope and change a slider -> a partial override is written.
    fireEvent.click(within(region).getByRole('button', { name: 'Étagère « Studio X »' }));
    const sliders = within(region).getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '180' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // The override badge appears now that the active shelf differs from global.
    await waitFor(() => expect(within(region).getByText('Personnalisée')).toBeTruthy());
  });

  it('persists a per-zone orientation that already has an explicit value', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    const prefs = { ...defaultShelfViewPrefsV1(), displayRowOrientations: { '0': 'portrait' as const } };
    renderWithProviders(
      <ShelfReadOnlyControls
        initialPrefs={prefs}
        activeShelfId="9"
        displayZones={[{ afterRow: 0, label: 'Top' }]}
      />,
    );
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    // The zone already has portrait; click landscape to flip it (spreads the existing map).
    const landscapeButtons = within(region).getAllByRole('button', { name: 'Paysage' });
    fireEvent.click(landscapeButtons[landscapeButtons.length - 1]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);
    expect(body.shelf_display_overrides_v1).toBeTruthy();
  });

  it('updates the global slot from a non-optimistic hierarchy overrides event', () => {
    renderWithProviders(
      <ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} activeShelfId="9" />,
    );
    const overrides = { global: { ...defaultShelfViewPrefsV1(), cellWidthPx: 123 }, shelves: {} };
    fireEvent(window, new CustomEvent(SHELF_DISPLAY_OVERRIDES_EVENT, { detail: { overrides, optimistic: false } }));
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    const sliders = within(region).getAllByRole('slider') as HTMLInputElement[];
    expect(sliders[0].value).toBe('123');
  });

  it('applies and cleans shelf-view CSS variables on shelf roots', () => {
    const root = document.createElement('div');
    root.className = 'shelf-view-root';
    root.style.setProperty('--display-aspect-row-0', 'portrait');
    root.style.setProperty('--not-a-display-aspect-row', 'kept');
    document.body.appendChild(root);
    const view = renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    expect(root.style.getPropertyValue('--display-aspect-row-0')).toBe('');
    expect(root.style.getPropertyValue('--not-a-display-aspect-row')).toBe('kept');
    expect(root.style.getPropertyValue('--shelf-cell-w-px')).not.toBe('');
    view.unmount();
    expect(root.style.getPropertyValue('--shelf-cell-w-px')).toBe('');
    root.remove();
  });

  it('ignores empty shelf preference sync events', () => {
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} activeShelfId="9" />);
    fireEvent(window, new CustomEvent(SHELF_VIEW_PREFS_EVENT, { detail: {} }));
    fireEvent(window, new CustomEvent(SHELF_DISPLAY_OVERRIDES_EVENT, { detail: {} }));
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    expect(within(region).getAllByRole('slider').length).toBeGreaterThan(0);
  });

  it('switches back to global scope, toggles labels, and resets a per-shelf override', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    const initial = {
      global: defaultShelfViewPrefsV1(),
      shelves: { '42': { cellWidthPx: 180 } },
    };
    renderWithProviders(
      <ShelfReadOnlyControls
        initialPrefs={defaultShelfViewPrefsV1()}
        initialOverrides={initial}
        activeShelfId="42"
        activeShelfName="Studio X"
      />,
    );
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    fireEvent.click(within(region).getByRole('button', { name: 'Étagère « Studio X »' }));
    fireEvent.click(within(region).getByRole('button', { name: 'Défauts globaux' }));
    expect(within(region).getByRole('button', { name: 'Défauts globaux' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(region).getByRole('button', { name: 'Afficher les titres' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.click(within(region).getByRole('button', { name: 'Étagère « Studio X »' }));
    fireEvent.click(within(region).getByRole('button', { name: /Réinitialiser/ }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);
    expect(body.shelf_display_overrides_v1.shelves['42']).toEqual({});
  });

  it('keeps the popover open on inside clicks and non-Escape keys', () => {
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    fireEvent.mouseDown(region);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(screen.getByRole('region', { name: TRIGGER })).toBeTruthy();
  });

  it('does not restore focus when the open trigger is unmounted', () => {
    const view = renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    view.unmount();
    expect(screen.queryByRole('region', { name: TRIGGER })).toBeNull();
  });

  it('skips focus restore when the trigger disappears before closing', () => {
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    const trigger = screen.getByRole('button', { name: TRIGGER });
    trigger.focus();
    fireEvent.click(trigger);
    trigger.remove();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: TRIGGER })).toBeNull();
  });

  it('abandons a queued settings save when unmounted before it starts', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    const view = renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const sliders = within(screen.getByRole('region', { name: TRIGGER })).getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '164' } });
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a settings response after unmount aborts the active request', async () => {
    const patch = { resolve: (_response: Response): void => { throw new Error('settings PATCH was not started'); } };
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      patch.resolve = resolve;
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const view = renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const sliders = within(screen.getByRole('region', { name: TRIGGER })).getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '168' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    view.unmount();
    patch.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('region', { name: TRIGGER })).toBeNull();
  });

  it('ignores abort errors from settings persistence', async () => {
    const abortError = new Error('cancelled');
    abortError.name = 'AbortError';
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const sliders = within(screen.getByRole('region', { name: TRIGGER })).getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '172' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.body.textContent).not.toContain('cancelled');
  });

  it('does not roll back toasts for a failed save superseded by a newer save', async () => {
    const first = { reject: (_reason: Error): void => { throw new Error('first settings PATCH was not started'); } };
    let callIndex = 0;
    const fetchMock = vi.fn(() => {
      callIndex += 1;
      if (callIndex === 1) {
        return new Promise<Response>((_resolve, reject) => {
          first.reject = reject;
        });
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const sliders = within(screen.getByRole('region', { name: TRIGGER })).getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '176' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(sliders[1], { target: { value: '188' } });
    first.reject(new Error('stale-save-failed'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(document.body.textContent).not.toContain('stale-save-failed');
  });

  it('drops a per-shelf override when the shelf value matches global', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    const initial = {
      global: defaultShelfViewPrefsV1(),
      shelves: { '42': { cellWidthPx: 180, cellSizePx: 180 } },
    };
    renderWithProviders(
      <ShelfReadOnlyControls
        initialPrefs={defaultShelfViewPrefsV1()}
        initialOverrides={initial}
        activeShelfId="42"
        activeShelfName="Studio X"
      />,
    );
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    fireEvent.click(within(region).getByRole('button', { name: 'Étagère « Studio X »' }));
    const sliders = within(region).getAllByRole('slider') as HTMLInputElement[];
    fireEvent.change(sliders[0], { target: { value: '120' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);
    expect(body.shelf_display_overrides_v1.shelves['42']).toEqual({});
  });

  it('persists every per-shelf semantic difference without empty-map noise', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    const globalPrefs = {
      ...defaultShelfViewPrefsV1(),
      displayRowOrientations: { '0': 'portrait' as const },
    };
    renderWithProviders(
      <ShelfReadOnlyControls
        initialPrefs={globalPrefs}
        initialOverrides={{ global: globalPrefs, shelves: {} }}
        activeShelfId="42"
        activeShelfName="Studio X"
        displayZones={[{ afterRow: 0, label: 'Top' }]}
      />,
    );
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    fireEvent.click(within(region).getByRole('button', { name: 'Étagère « Studio X »' }));
    const sliders = within(region).getAllByRole('slider') as HTMLInputElement[];

    fireEvent.change(sliders[2], { target: { value: '1.15' } });
    await waitForFetchCount(fetchMock, 1);
    fireEvent.click(within(region).getByRole('button', { name: 'Couvrir', pressed: false }));
    await waitForFetchCount(fetchMock, 2);
    fireEvent.change(sliders[0], { target: { value: '140' } });
    await waitForFetchCount(fetchMock, 3);
    fireEvent.change(sliders[0], { target: { value: '180' } });
    await waitForFetchCount(fetchMock, 4);
    fireEvent.change(sliders[1], { target: { value: '196' } });
    await waitForFetchCount(fetchMock, 5);
    fireEvent.change(sliders[3], { target: { value: '8' } });
    await waitForFetchCount(fetchMock, 6);
    fireEvent.change(sliders[3], { target: { value: '12' } });
    await waitForFetchCount(fetchMock, 7);
    fireEvent.change(sliders[4], { target: { value: '24' } });
    await waitForFetchCount(fetchMock, 8);
    fireEvent.change(sliders[5], { target: { value: '160' } });
    await waitForFetchCount(fetchMock, 9);
    fireEvent.click(within(region).getByRole('button', { name: 'Grande' }));
    await waitForFetchCount(fetchMock, 10);
    fireEvent.click(within(region).getByRole('button', { name: 'Afficher les titres' }));
    await waitForFetchCount(fetchMock, 11);
    fireEvent.click(within(region).getByRole('button', { name: 'Mode compact' }));
    await waitForFetchCount(fetchMock, 12);
    fireEvent.click(within(region).getAllByRole('button', { name: 'Paysage' })[0]);
    await waitForFetchCount(fetchMock, 13);
    fireEvent.click(within(region).getAllByRole('button', { name: 'Paysage' }).at(-1)!);
    await waitForFetchCount(fetchMock, 14);

    const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);
    const partial = body.shelf_display_overrides_v1.shelves['42'];
    expect(partial).toMatchObject({
      coverScale: 1.15,
      fitMode: 'cover',
      cellWidthPx: 180,
      cellSizePx: 180,
      cellHeightPx: 196,
      rowGapPx: 12,
      gapPx: 12,
      sectionGapPx: 24,
      frontDisplaySizePx: 160,
      textDensity: 'lg',
      showLabels: false,
      compact: true,
      displayOrientation: 'landscape',
      displayRowOrientations: { '0': 'landscape' },
    });
  });

  it('shows the saving spinner while a settings PATCH is pending', async () => {
    const patch = { resolve: (_response: Response): void => { throw new Error('settings PATCH was not started'); } };
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      patch.resolve = resolve;
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    const sliders = within(region).getAllByRole('slider') as HTMLInputElement[];
    fireEvent.change(sliders[0], { target: { value: '160' } });
    await waitFor(() => expect(region.getAttribute('aria-busy')).toBe('true'));
    expect(within(region).getByRole('button', { name: /Réinitialiser/ }).querySelector('.animate-spin')).toBeTruthy();
    patch.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await waitFor(() => expect(region.getAttribute('aria-busy')).toBe('false'));
  });
});
