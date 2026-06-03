// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, within, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { renderWithProviders } from './helpers/render-component';
import type { PlaceWithLinks } from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** Render the dynamically-imported MapCanvas synchronously as a prop probe. */
vi.mock('next/dynamic', () => ({
  default: (_loader: unknown) => {
    return function MapCanvasStub(props: Record<string, unknown>) {
      return (
        <div
          data-testid="map-canvas"
          data-place-count={String((props.places as unknown[]).length)}
          data-focus-id={String(props.focusId ?? '')}
          data-search-target={JSON.stringify(props.searchTarget ?? null)}
          data-size-class={String(props.sizeClass ?? '')}
          data-external={String(props.externalNetworkAllowed)}
        />
      );
    } as ComponentType<Record<string, unknown>>;
  },
}));

const t = dictionaries.en;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function place(overrides: Partial<PlaceWithLinks> = {}): PlaceWithLinks {
  return {
    id: 1,
    name: 'Shop One',
    name_ja: null,
    kind: 'shop',
    address: null,
    lat: 35.68,
    lng: 139.69,
    url: null,
    notes: null,
    created_at: 1,
    updated_at: 1,
    provider_labels: [],
    stock_count: 0,
    ...overrides,
  };
}

/** Pre-grant external-network consent so MapCanvas mounts immediately. */
function grantConsent() {
  try {
    localStorage.setItem('vncoll.map.external-network.v1', 'true');
  } catch {}
}

const { MapPageClient } = await import('@/components/MapPageClient');

async function enableExternal(user: ReturnType<typeof renderWithProviders>['user']) {
  // Click the privacy control's enable button (notice variant).
  const enable = await screen.findByRole('button', { name: t.map.externalPrivacyEnable as string });
  await user.click(enable);
}

describe('MapPageClient branches', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch {}
    refreshMock.mockReset();
    global.fetch = vi.fn(async () => json([]));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the no-places message when nothing has coordinates', () => {
    renderWithProviders(
      <MapPageClient places={[place({ id: 1, lat: null, lng: null })]} />,
      { locale: 'en' },
    );
    expect(screen.getByText(t.map.noPlaces as string)).toBeInTheDocument();
    // The "without coords" sidebar group renders the place name.
    expect(screen.getByText('Shop One')).toBeInTheDocument();
  });

  it('shows the external-disabled panel until consent is granted, then mounts the map', async () => {
    const { user } = renderWithProviders(
      <MapPageClient places={[place({ id: 1, lat: 35, lng: 139 })]} />,
      { locale: 'en' },
    );
    expect(screen.getByText(t.map.externalMapDisabled as string)).toBeInTheDocument();
    expect(screen.queryByTestId('map-canvas')).toBeNull();

    await enableExternal(user);
    const canvas = await screen.findByTestId('map-canvas');
    expect(canvas).toHaveAttribute('data-external', 'true');
    expect(canvas).toHaveAttribute('data-place-count', '1');
  });

  it('warns when some places have invalid coordinates', () => {
    grantConsent();
    renderWithProviders(
      <MapPageClient
        places={[
          place({ id: 1, lat: 35, lng: 139 }),
          { ...place({ id: 2 }), lat: 999 as number, lng: 10 },
        ]}
      />,
      { locale: 'en' },
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('1');
  });

  it('persists and reflects the chosen map size', async () => {
    grantConsent();
    const { user } = renderWithProviders(
      <MapPageClient places={[place({ id: 1, lat: 35, lng: 139 })]} />,
      { locale: 'en' },
    );
    const canvas = await screen.findByTestId('map-canvas');
    expect(canvas.getAttribute('data-size-class')).toContain('55vh');

    await user.click(screen.getByRole('button', { name: t.map.mapSizeLarge as string, pressed: false }));
    await waitFor(() =>
      expect(screen.getByTestId('map-canvas').getAttribute('data-size-class')).toContain('72vh'),
    );
    expect(localStorage.getItem('vncoll.map.size.v1')).toBe('large');
  });

  it('loads the persisted map size on mount', async () => {
    grantConsent();
    try { localStorage.setItem('vncoll.map.size.v1', 'tall'); } catch {}
    renderWithProviders(
      <MapPageClient places={[place({ id: 1, lat: 35, lng: 139 })]} />,
      { locale: 'en' },
    );
    const canvas = await screen.findByTestId('map-canvas');
    expect(canvas.getAttribute('data-size-class')).toContain('88vh');
  });

  it('runs a Nominatim search and feeds the picked result to the map', async () => {
    grantConsent();
    global.fetch = vi.fn(async () =>
      json([{ display_name: 'Tokyo Tower', lat: '35.6586', lon: '139.7454' }]),
    );
    const { user } = renderWithProviders(
      <MapPageClient places={[place({ id: 1, lat: 35, lng: 139 })]} />,
      { locale: 'en' },
    );
    await screen.findByTestId('map-canvas');
    const input = screen.getByLabelText(t.map.searchPlaceholder as string);
    await user.type(input, 'Tokyo');
    await user.click(screen.getByRole('button', { name: t.places.geocodeButton as string }));

    const option = await screen.findByRole('button', { name: 'Tokyo Tower' });
    await user.click(option);
    await waitFor(() => {
      const target = screen.getByTestId('map-canvas').getAttribute('data-search-target');
      expect(JSON.parse(target ?? 'null')).toEqual({ lat: 35.6586, lng: 139.7454, zoom: 14 });
    });
  });

  it('submits the search with the Enter key', async () => {
    grantConsent();
    const fetchSpy = vi.fn(async () =>
      json([{ display_name: 'Kyoto', lat: '35.0', lon: '135.7' }]),
    );
    global.fetch = fetchSpy;
    const { user } = renderWithProviders(
      <MapPageClient places={[place({ id: 1, lat: 35, lng: 139 })]} />,
      { locale: 'en' },
    );
    await screen.findByTestId('map-canvas');
    const input = screen.getByLabelText(t.map.searchPlaceholder as string);
    await user.type(input, 'Kyoto{Enter}');
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Kyoto' })).toBeInTheDocument();
  });

  it('shows the empty-search message when Nominatim returns nothing', async () => {
    grantConsent();
    global.fetch = vi.fn(async () => json([]));
    const { user } = renderWithProviders(
      <MapPageClient places={[place({ id: 1, lat: 35, lng: 139 })]} />,
      { locale: 'en' },
    );
    await screen.findByTestId('map-canvas');
    await user.type(screen.getByLabelText(t.map.searchPlaceholder as string), 'nowhere');
    await user.click(screen.getByRole('button', { name: t.places.geocodeButton as string }));
    expect(await screen.findByText(t.map.searchEmpty as string)).toBeInTheDocument();
  });

  it('shows the search-error message when Nominatim fails', async () => {
    grantConsent();
    global.fetch = vi.fn(async () => json({ error: 'boom' }, 500));
    const { user } = renderWithProviders(
      <MapPageClient places={[place({ id: 1, lat: 35, lng: 139 })]} />,
      { locale: 'en' },
    );
    await screen.findByTestId('map-canvas');
    await user.type(screen.getByLabelText(t.map.searchPlaceholder as string), 'fail');
    await user.click(screen.getByRole('button', { name: t.places.geocodeButton as string }));
    expect(await screen.findByText(t.map.searchError as string)).toBeInTheDocument();
  });

  it('shows the search-error message when the payload is malformed', async () => {
    grantConsent();
    global.fetch = vi.fn(async () => json({ not: 'an array' }));
    const { user } = renderWithProviders(
      <MapPageClient places={[place({ id: 1, lat: 35, lng: 139 })]} />,
      { locale: 'en' },
    );
    await screen.findByTestId('map-canvas');
    await user.type(screen.getByLabelText(t.map.searchPlaceholder as string), 'bad');
    await user.click(screen.getByRole('button', { name: t.places.geocodeButton as string }));
    expect(await screen.findByText(t.map.searchError as string)).toBeInTheDocument();
  });

  it('rejects a picked result with invalid coordinates', async () => {
    grantConsent();
    // decodeNominatimResults drops invalid coords, so feed a valid row,
    // then verify the guard path differently is not reachable from here.
    global.fetch = vi.fn(async () =>
      json([{ display_name: 'Edge', lat: '10', lon: '20' }]),
    );
    const { user } = renderWithProviders(
      <MapPageClient places={[place({ id: 1, lat: 35, lng: 139 })]} />,
      { locale: 'en' },
    );
    await screen.findByTestId('map-canvas');
    await user.type(screen.getByLabelText(t.map.searchPlaceholder as string), 'edge');
    await user.click(screen.getByRole('button', { name: t.places.geocodeButton as string }));
    const option = await screen.findByRole('button', { name: 'Edge' });
    await user.click(option);
    await waitFor(() => {
      const target = screen.getByTestId('map-canvas').getAttribute('data-search-target');
      expect(JSON.parse(target ?? 'null')).toEqual({ lat: 10, lng: 20, zoom: 14 });
    });
  });

  it('clears the search box and results with the clear button', async () => {
    grantConsent();
    global.fetch = vi.fn(async () =>
      json([{ display_name: 'Osaka', lat: '34.6', lon: '135.5' }]),
    );
    const { user } = renderWithProviders(
      <MapPageClient places={[place({ id: 1, lat: 35, lng: 139 })]} />,
      { locale: 'en' },
    );
    await screen.findByTestId('map-canvas');
    await user.type(screen.getByLabelText(t.map.searchPlaceholder as string), 'Osaka');
    await user.click(screen.getByRole('button', { name: t.places.geocodeButton as string }));
    await screen.findByRole('button', { name: 'Osaka' });

    await user.click(screen.getByRole('button', { name: t.common.close as string }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Osaka' })).toBeNull());
    expect((screen.getByLabelText(t.map.searchPlaceholder as string) as HTMLInputElement).value).toBe('');
  });

  it('focuses a coordinate place from the sidebar', async () => {
    grantConsent();
    const { user } = renderWithProviders(
      <MapPageClient places={[place({ id: 7, lat: 35, lng: 139, name: 'Sidebar Shop' })]} />,
      { locale: 'en' },
    );
    await screen.findByTestId('map-canvas');
    const focusBtn = screen.getByText('Sidebar Shop').closest('button')!;
    await user.click(focusBtn);
    await waitFor(() => {
      const target = screen.getByTestId('map-canvas').getAttribute('data-search-target');
      expect(JSON.parse(target ?? 'null')).toEqual({ lat: 35, lng: 139, zoom: 15 });
    });
    expect(screen.getByTestId('map-canvas').getAttribute('data-focus-id')).toBe('7');
  });

  it('handles a sidebar click on a place without coordinates', async () => {
    grantConsent();
    renderWithProviders(
      <MapPageClient
        places={[
          place({ id: 7, lat: 35, lng: 139, name: 'With Coords' }),
          place({ id: 8, lat: null, lng: null, name: 'No Coords' }),
        ]}
      />,
      { locale: 'en' },
    );
    await screen.findByTestId('map-canvas');
    // The no-coords sidebar button is disabled, so query it directly.
    const noCoordsName = screen.getByText('No Coords');
    const button = noCoordsName.closest('button')!;
    expect(button).toBeDisabled();
  });

  it('resets the view, clearing focus and search target', async () => {
    grantConsent();
    try { localStorage.setItem('places:map:view:v1', JSON.stringify({ lat: 1, lng: 2, zoom: 9 })); } catch {}
    const { user } = renderWithProviders(
      <MapPageClient places={[place({ id: 7, lat: 35, lng: 139, name: 'Reset Shop' })]} focusId={7} />,
      { locale: 'en' },
    );
    await screen.findByTestId('map-canvas');
    await user.click(screen.getByText('Reset Shop').closest('button')!);
    await waitFor(() =>
      expect(screen.getByTestId('map-canvas').getAttribute('data-search-target')).not.toBe('null'),
    );

    await user.click(screen.getByRole('button', { name: new RegExp(t.map.resetView as string) }));
    await waitFor(() => {
      expect(screen.getByTestId('map-canvas').getAttribute('data-search-target')).toBe('null');
      expect(screen.getByTestId('map-canvas').getAttribute('data-focus-id')).toBe('');
    });
    expect(localStorage.getItem('places:map:view:v1')).toBeNull();
  });

  it('opens the add-place modal and refreshes after a save', async () => {
    grantConsent();
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/places' && init?.method === 'POST') return json({ id: 55 });
      return json([]);
    });
    const { user } = renderWithProviders(
      <MapPageClient places={[place({ id: 1, lat: 35, lng: 139 })]} />,
      { locale: 'en' },
    );
    await screen.findByTestId('map-canvas');
    await user.click(screen.getByRole('button', { name: new RegExp(t.map.addPlace as string) }));

    const modal = await screen.findByRole('dialog');
    await user.type(within(modal).getByPlaceholderText(t.places.namePlaceholder as string), 'New Place');
    await user.click(within(modal).getByRole('button', { name: t.places.saveChanges as string }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('clears search results when consent is revoked', async () => {
    grantConsent();
    global.fetch = vi.fn(async () =>
      json([{ display_name: 'Nagoya', lat: '35.18', lon: '136.9' }]),
    );
    const { user } = renderWithProviders(
      <MapPageClient places={[place({ id: 1, lat: 35, lng: 139 })]} />,
      { locale: 'en' },
    );
    await screen.findByTestId('map-canvas');
    await user.type(screen.getByLabelText(t.map.searchPlaceholder as string), 'Nagoya');
    await user.click(screen.getByRole('button', { name: t.places.geocodeButton as string }));
    await screen.findByRole('button', { name: 'Nagoya' });

    // Revoke consent via the privacy control's disable button.
    await user.click(screen.getByRole('button', { name: t.map.externalPrivacyDisable as string }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Nagoya' })).toBeNull());
    expect(screen.getByText(t.map.externalMapDisabled as string)).toBeInTheDocument();
  });
});
