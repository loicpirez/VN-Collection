// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { PlaceBrowser } from '@/components/PlaceBrowser';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';
import type { PlaceWithLinks } from '@/lib/db';
import { DisplaySettingsProvider } from '@/lib/settings/client';

vi.mock('@/components/PlaceCard', () => ({
  PlaceCard: ({
    place,
    onEdit,
    onDelete,
    onAssign,
  }: {
    place: PlaceWithLinks;
    onEdit: (place: PlaceWithLinks) => void;
    onDelete: (place: PlaceWithLinks) => void;
    onAssign: (place: PlaceWithLinks) => void;
  }) => (
    <div role="listitem">
      <span>{place.name}</span>
      <button type="button" onClick={() => onEdit(place)}>edit card</button>
      <button type="button" onClick={() => onDelete(place)}>delete card</button>
      <button type="button" onClick={() => onAssign(place)}>assign card</button>
    </div>
  ),
}));

vi.mock('@/components/AddEditPlaceModal', () => ({
  AddEditPlaceModal: ({
    place,
    initialBranch,
    onClose,
    onSaved,
  }: {
    place: PlaceWithLinks | null;
    initialBranch: string | null;
    onClose: () => void;
    onSaved: (id?: number) => void | Promise<void>;
  }) => (
    <div role="dialog" aria-label="place modal">
      <span>{place ? place.name : 'new place'}</span>
      {initialBranch && <span>{initialBranch}</span>}
      <button type="button" onClick={onClose}>close place modal</button>
      <button type="button" onClick={() => { void onSaved(77); }}>save place modal</button>
    </div>
  ),
}));

vi.mock('@/components/AssignProviderDialog', () => ({
  AssignProviderDialog: ({
    place,
    onClose,
    onSaved,
  }: {
    place: PlaceWithLinks;
    onClose: () => void;
    onSaved: () => void;
  }) => (
    <div role="dialog" aria-label="assign provider">
      <span>{place.name}</span>
      <button type="button" onClick={onClose}>close assign modal</button>
      <button type="button" onClick={onSaved}>save assign modal</button>
    </div>
  ),
}));

const t = dictionaries[DEFAULT_LOCALE];
const now = Date.now();

function place(overrides: Partial<PlaceWithLinks>): PlaceWithLinks {
  return {
    id: 1,
    name: 'Akiba Shop',
    name_ja: '秋葉店',
    kind: 'shop',
    address: 'Tokyo',
    lat: 35.7,
    lng: 139.7,
    url: 'https://example.test/shop',
    notes: null,
    created_at: now,
    updated_at: now,
    provider_labels: ['Sofmap Tokyo'],
    stock_count: 3,
    ...overrides,
  };
}

function placesPayload() {
  return {
    places: [
      place({ id: 1, name: 'Akiba Shop', provider_labels: ['Sofmap Tokyo'], stock_count: 3, updated_at: now - 9 * 86_400_000 }),
      place({
        id: 2,
        name: 'No GPS Chain',
        name_ja: null,
        kind: 'chain',
        address: null,
        lat: null,
        lng: null,
        url: null,
        provider_labels: [],
        stock_count: 0,
      }),
    ],
    known_places: ['Akiba Shop'],
  };
}

function manyPlacesPayload() {
  return {
    places: Array.from({ length: 65 }, (_, index) => place({
      id: index + 1,
      name: `Place ${String(index + 1).padStart(2, '0')}`,
      name_ja: null,
      provider_labels: index % 2 === 0 ? [`Provider ${index + 1}`] : [],
      stock_count: index,
      updated_at: now - index * 1000,
    })),
    known_places: [],
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderBrowser() {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <PlaceBrowser />
    </DisplaySettingsProvider>,
  );
}

describe('PlaceBrowser', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {}
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/places') return json(placesPayload());
      if (u === '/api/places/unassigned') return json({ branches: ['Sofmap Osaka'] });
      if (u === '/api/places/77/link' && init?.method === 'POST') return json({ ok: true });
      return json({});
    });
  });

  it('loads places, switches views, filters, and resets filters', async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Akiba Shop')).toBeTruthy());
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: t.places.viewList as string }));
    expect(screen.getAllByRole('link', { name: t.places.openPlace as string }).length).toBe(2);
    fireEvent.change(screen.getByRole('combobox', { name: t.places.sortLabel as string }), { target: { value: 'stock' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.filtersLabel as string) }));
    fireEvent.change(screen.getByLabelText(t.places.kindLabel as string), { target: { value: 'chain' } });
    expect(screen.getByText('No GPS Chain')).toBeTruthy();
    expect(screen.queryByText('Akiba Shop')).toBeNull();
    fireEvent.change(screen.getByLabelText('GPS'), { target: { value: 'no_gps' } });
    fireEvent.click(screen.getByRole('button', { name: (t.places.hideStale as string).replace('{n}', '1') }));
    fireEvent.change(screen.getByLabelText(t.places.searchPlaceholder as string), { target: { value: 'No GPS' } });
    fireEvent.click(screen.getByRole('button', { name: t.places.resetFilters as string }));
    expect(screen.getByText('Akiba Shop')).toBeTruthy();
  });

  it('restores view preferences and covers linked, unlinked, gps, and provider search filters', async () => {
    localStorage.setItem('vncoll.places.prefs.v1', JSON.stringify({ sort: 'fresh', view: 'list' }));
    renderBrowser();
    await waitFor(() => expect(screen.getAllByRole('link', { name: t.places.openPlace as string }).length).toBe(2));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.tabLinked as string) }));
    expect(screen.getByText('Akiba Shop')).toBeTruthy();
    expect(screen.queryByText('No GPS Chain')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.tabUnlinked as string) }));
    expect(screen.queryByText('Akiba Shop')).toBeNull();
    expect(screen.getByText('No GPS Chain')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.tabAll as string) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.filtersLabel as string) }));
    fireEvent.change(screen.getByLabelText('GPS'), { target: { value: 'gps' } });
    expect(screen.getByText('Akiba Shop')).toBeTruthy();
    expect(screen.queryByText('No GPS Chain')).toBeNull();
    fireEvent.change(screen.getByLabelText(t.places.searchPlaceholder as string), { target: { value: 'sofmap' } });
    expect(screen.getByText('Akiba Shop')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.places.viewCards as string }));
    expect(screen.getByRole('list')).toBeTruthy();
  });

  it('paginates long registries and caps the page when a filter shrinks the result', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u === '/api/places') return json(manyPlacesPayload());
      if (u === '/api/places/unassigned') return json({ branches: [] });
      return json({});
    });
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Place 01')).toBeTruthy());
    expect(screen.getByText('1-60 / 65')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.common.next as string }));
    await waitFor(() => expect(screen.getByText('61-65 / 65')).toBeTruthy());
    expect(screen.getByText('Place 65')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.filtersLabel as string) }));
    fireEvent.change(screen.getByLabelText(t.places.kindLabel as string), { target: { value: 'storage' } });
    expect(screen.getByText(t.places.noPlaces as string)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t.places.kindLabel as string), { target: { value: '' } });
    await waitFor(() => expect(screen.getByText('1-60 / 65')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: t.common.next as string }));
    await waitFor(() => expect(screen.getByText('61-65 / 65')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: t.common.prev as string }));
    await waitFor(() => expect(screen.getByText('1-60 / 65')).toBeTruthy());
  });

  it('opens child modals from cards and reacts to delete callbacks', async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Akiba Shop')).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: 'edit card' })[0]);
    expect(screen.getByRole('dialog', { name: 'place modal' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'close place modal' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'place modal' })).toBeNull());
    fireEvent.click(screen.getAllByRole('button', { name: 'assign card' })[0]);
    expect(screen.getByRole('dialog', { name: 'assign provider' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'save assign modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'close assign modal' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'assign provider' })).toBeNull());
    fireEvent.click(screen.getAllByRole('button', { name: 'delete card' })[0]);
    expect(screen.queryByText('Akiba Shop')).toBeNull();
  });

  it('opens the new-place and list-row edit flows and reloads after save', async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Akiba Shop')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: t.places.addPlace as string }));
    expect(within(screen.getByRole('dialog', { name: 'place modal' })).getByText('new place')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'save place modal' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'place modal' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: t.places.viewList as string }));
    fireEvent.click(screen.getAllByRole('button', { name: t.places.editPlace as string })[0]);
    expect(within(screen.getByRole('dialog', { name: 'place modal' })).getByText('Akiba Shop')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'save place modal' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'place modal' })).toBeNull());
  });

  it('creates a place for an unassigned branch and links it', async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Akiba Shop')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.tabUnassigned as string) }));
    expect(screen.getByText('Sofmap Osaka')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.places.unassignedAssignCta as string }));
    const dialog = screen.getByRole('dialog', { name: 'place modal' });
    expect(within(dialog).getByText('Sofmap Osaka')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'save place modal' }));
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((call) => String(call[0]) === '/api/places/77/link')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'place modal' })).toBeNull());
  });

  it('closes unassigned creation and reports link failures without dropping the modal state early', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/places') return json(placesPayload());
      if (u === '/api/places/unassigned') return json({ branches: ['Sofmap Osaka'] });
      if (u === '/api/places/77/link' && init?.method === 'POST') return json({ error: 'link failed' }, 500);
      return json({});
    });
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Akiba Shop')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.tabUnassigned as string) }));
    fireEvent.click(screen.getByRole('button', { name: t.places.unassignedAssignCta as string }));
    fireEvent.click(screen.getByRole('button', { name: 'close place modal' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'place modal' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: t.places.unassignedAssignCta as string }));
    fireEvent.click(screen.getByRole('button', { name: 'save place modal' }));
    await waitFor(() => expect(screen.getByText('link failed')).toBeTruthy());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'place modal' })).toBeNull());
  });

  it('shows the empty unassigned state after searching branches', async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Akiba Shop')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.places.tabUnassigned as string) }));
    fireEvent.change(screen.getByLabelText(t.places.searchPlaceholder as string), { target: { value: 'missing branch' } });
    expect(screen.getByText(t.places.unassignedEmpty as string)).toBeTruthy();
  });

  it('shows load errors and retries', async () => {
    let fail = true;
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (fail) return json({ error: 'places failed' }, 500);
      const u = String(url);
      if (u === '/api/places') return json(placesPayload());
      if (u === '/api/places/unassigned') return json({ branches: [] });
      return json({});
    });
    renderBrowser();
    await waitFor(() => expect(screen.getByText('places failed')).toBeTruthy());
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: t.common.retry as string }));
    await waitFor(() => expect(screen.getByText('Akiba Shop')).toBeTruthy());
  });
});
