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

describe('ShelfReadOnlyControls', () => {
  beforeEach(() => {
    global.fetch = okFetch() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function open() {
    const trigger = screen.getByRole('button', { name: TRIGGER });
    fireEvent.click(trigger);
    return trigger;
  }

  it('renders only the trigger button while closed', () => {
    const { container } = renderWithProviders(
      <ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />,
    );
    expect(screen.getByRole('button', { name: TRIGGER })).toBeTruthy();
    expect(container.querySelector('[role="region"]')).toBeNull();
  });

  it('opens the popover with sliders and toggles', () => {
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    expect(region).toBeTruthy();
    // Range sliders (cell width/height/coverScale/rowGap/sectionGap/front).
    expect(within(region).getAllByRole('slider').length).toBeGreaterThanOrEqual(5);
  });

  it('persists a slider change via PATCH /api/settings', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    const sliders = within(region).getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '200' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/settings');
    expect((init as RequestInit).method).toBe('PATCH');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.shelf_view_prefs_v1).toBeTruthy();
  });

  it('persists each of the six dimension sliders', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    const sliders = within(region).getAllByRole('slider') as HTMLInputElement[];
    // cellWidth, cellHeight, coverScale, rowGap, sectionGap, frontDisplaySize.
    const values = ['200', '210', '1.2', '12', '24', '160'];
    sliders.slice(0, 6).forEach((s, i) => {
      fireEvent.change(s, { target: { value: values[i] ?? '100' } });
    });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(6));
  });

  it('toggles compact, contain fit, and portrait orientation', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    fireEvent.click(within(region).getByRole('button', { name: 'Mode compact' }));
    fireEvent.click(within(region).getByRole('button', { name: 'Contenir' }));
    fireEvent.click(within(region).getByRole('button', { name: 'Portrait' }));
    fireEvent.click(within(region).getByRole('button', { name: 'Paysage' }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4));
  });

  it('toggles showLabels and fit mode buttons', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    // "Couvrir" (cover) fit-mode button.
    fireEvent.click(within(region).getByRole('button', { name: 'Couvrir', pressed: false }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // The cover button should now be pressed.
    expect(within(region).getByRole('button', { name: 'Couvrir' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('cycles text-density buttons', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    fireEvent.click(within(region).getByRole('button', { name: 'Grande' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(within(region).getByRole('button', { name: 'Grande' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('disables the front-display sliders when hasDisplaySlots is false', () => {
    renderWithProviders(
      <ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} hasDisplaySlots={false} />,
    );
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    const disabledSliders = within(region)
      .getAllByRole('slider')
      .filter((el) => el.hasAttribute('disabled'));
    expect(disabledSliders.length).toBeGreaterThanOrEqual(1);
    // Orientation section + per-zone toggles are hidden without display slots.
    expect(within(region).queryByRole('button', { name: 'Portrait' })).toBeNull();
  });

  it('shows the scope selector and per-zone orientation toggles when an active shelf is provided', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(
      <ShelfReadOnlyControls
        initialPrefs={defaultShelfViewPrefsV1()}
        activeShelfId="42"
        activeShelfName="Studio X"
        displayZones={[{ afterRow: 0, label: 'Top' }]}
      />,
    );
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    // Scope selector buttons.
    const shelfScope = within(region).getByRole('button', { name: 'Étagère « Studio X »' });
    fireEvent.click(shelfScope);
    expect(shelfScope.getAttribute('aria-pressed')).toBe('true');
    // Per-zone orientation toggle exists (Portrait appears for the global +
    // the zone row). Click a landscape to drive the per-shelf persist path.
    const landscapeButtons = within(region).getAllByRole('button', { name: 'Paysage' });
    fireEvent.click(landscapeButtons[landscapeButtons.length - 1]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);
    expect(body.shelf_display_overrides_v1).toBeTruthy();
  });

  it('runs the fill-screen helper when shelf dimensions are known', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(
      <ShelfReadOnlyControls
        initialPrefs={defaultShelfViewPrefsV1()}
        shelfCols={4}
        shelfRows={3}
      />,
    );
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    fireEvent.click(within(region).getByRole('button', { name: /Ajuster/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('resets to defaults via the Reset button', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    fireEvent.click(within(region).getByRole('button', { name: /Réinitialiser/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('reverts and toasts on a failed PATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom-save-failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    const sliders = within(region).getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '160' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // The server-supplied error message surfaces via the toast portal.
    await waitFor(() => expect(document.body.textContent).toContain('boom-save-failed'));
  });

  it('closes the popover on Escape', () => {
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    open();
    expect(screen.getByRole('region', { name: TRIGGER })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: TRIGGER })).toBeNull();
  });

  it('syncs from a global prefs CustomEvent', () => {
    renderWithProviders(<ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} />);
    const next = { ...defaultShelfViewPrefsV1(), cellWidthPx: 240 };
    fireEvent(window, new CustomEvent(SHELF_VIEW_PREFS_EVENT, { detail: { prefs: next } }));
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    const sliders = within(region).getAllByRole('slider');
    expect((sliders[0] as HTMLInputElement).value).toBe('240');
  });

  it('syncs from a hierarchy overrides CustomEvent', () => {
    renderWithProviders(
      <ShelfReadOnlyControls initialPrefs={defaultShelfViewPrefsV1()} activeShelfId="9" />,
    );
    const overrides = {
      global: { ...defaultShelfViewPrefsV1(), cellWidthPx: 90 },
      shelves: {},
    };
    fireEvent(window, new CustomEvent(SHELF_DISPLAY_OVERRIDES_EVENT, { detail: { overrides } }));
    open();
    const region = screen.getByRole('region', { name: TRIGGER });
    const sliders = within(region).getAllByRole('slider');
    expect((sliders[0] as HTMLInputElement).value).toBe('90');
  });
});
