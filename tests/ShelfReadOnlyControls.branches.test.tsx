// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { ShelfReadOnlyControls } from '@/components/ShelfReadOnlyControls';
import { defaultShelfViewPrefsV1, SHELF_DISPLAY_OVERRIDES_EVENT } from '@/lib/shelf-view-prefs';

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
});
