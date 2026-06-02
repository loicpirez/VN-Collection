// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import type { ShelfDisplaySlotEntry, ShelfEntry, ShelfSlotEntry, ShelfUnit, ShelfUnitWithCount } from '@/lib/db';

let searchParamsValue = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/shelf',
  useSearchParams: () => searchParamsValue,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

// SafeImage needs DisplaySettings context; EditionInfoPopover pulls a
// heavy popover tree. Both are tangential to the editor's branch logic.
vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt }: { alt: string }) => <span data-mock-safe-image>{alt}</span>,
}));
vi.mock('@/components/EditionInfoPopover', () => ({
  EditionInfoTrigger: () => <span data-mock-edition-info />,
}));

import { ShelfLayoutEditor } from '@/components/ShelfLayoutEditor';

function unit(overrides: Partial<ShelfUnitWithCount> = {}): ShelfUnitWithCount {
  return {
    id: 1,
    name: 'Studio X',
    cols: 2,
    rows: 2,
    order_index: 0,
    created_at: 0,
    updated_at: 0,
    placed_count: 0,
    ...overrides,
  };
}

function bareUnit(overrides: Partial<ShelfUnit> = {}): ShelfUnit {
  const { placed_count: _omit, ...rest } = unit(overrides as Partial<ShelfUnitWithCount>);
  void _omit;
  return rest;
}

function poolEntry(overrides: Partial<ShelfEntry> = {}): ShelfEntry {
  return {
    vn_id: 'v90001',
    release_id: 'r90001',
    notes: null,
    location: 'unknown',
    physical_location: [],
    box_type: 'none',
    edition_label: 'Limited',
    condition: null,
    price_paid: null,
    currency: null,
    acquired_date: null,
    owned_platform: null,
    dumped: false,
    added_at: 0,
    vn_title: 'Title Y',
    vn_image_thumb: null,
    vn_image_url: 'https://example.test/c.jpg',
    vn_local_image_thumb: null,
    vn_image_sexual: 0,
    rel_image_thumb: null,
    rel_image_url: null,
    rel_local_image_thumb: null,
    rel_image_sexual: null,
    vn_platforms: [],
    vn_languages: [],
    vn_released: null,
    rel_title: null,
    rel_platforms: [],
    rel_languages: [],
    rel_released: null,
    rel_resolution: null,
    rel_minage: null,
    rel_patch: false,
    rel_freeware: false,
    rel_official: true,
    rel_has_ero: false,
    ...overrides,
  };
}

function slot(overrides: Partial<ShelfSlotEntry> = {}): ShelfSlotEntry {
  const { notes: _n, location: _l, box_type: _b, added_at: _a, rel_minage: _m, rel_patch: _p, rel_freeware: _f, rel_official: _o, rel_has_ero: _e, ...base } = poolEntry();
  void [_n, _l, _b, _a, _m, _p, _f, _o, _e];
  return { ...base, shelf_id: 1, row: 0, col: 0, box_type: 'none', ...overrides };
}

function displaySlot(overrides: Partial<ShelfDisplaySlotEntry> = {}): ShelfDisplaySlotEntry {
  return { ...slot(), after_row: 0, position: 0, placed_at: 1, ...overrides } as ShelfDisplaySlotEntry;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Fetch router that hydrates a specific shelf id with given slots/displays. */
function fetchWithGrid(
  shelves: ShelfUnitWithCount[],
  byId: Record<number, { slots: ShelfSlotEntry[]; displays: ShelfDisplaySlotEntry[] }>,
) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const detail = url.match(/\/api\/shelves\/(\d+)$/);
    if (detail) {
      const id = Number(detail[1]);
      const s = shelves.find((x) => x.id === id) ?? unit({ id });
      const grid = byId[id] ?? { slots: [], displays: [] };
      return json({ shelf: bareUnit(s), slots: grid.slots, displays: grid.displays });
    }
    if (url.includes('/api/shelves')) return json({ shelves });
    return json({ ok: true });
  });
}

/**
 * Default fetch router: shelf-detail GET returns an empty grid for the
 * requested shelf; everything else returns a benign ok. Individual
 * tests override `global.fetch` for the path they exercise.
 */
function defaultFetch(shelves: ShelfUnitWithCount[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const detail = url.match(/\/api\/shelves\/(\d+)$/);
    if (detail) {
      const id = Number(detail[1]);
      const s = shelves.find((x) => x.id === id) ?? unit({ id });
      return json({ shelf: bareUnit(s), slots: [], displays: [] });
    }
    if (url.includes('/api/shelves')) {
      return json({ shelves });
    }
    return json({ ok: true });
  });
}

describe('ShelfLayoutEditor', () => {
  beforeEach(() => {
    searchParamsValue = new URLSearchParams();
    global.fetch = defaultFetch([unit()]) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders shelf tabs and the toolbar for the active shelf', async () => {
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    expect(screen.getByRole('tab', { name: /Studio X/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nouvelle étagère' })).toBeTruthy();
    // Active shelf detail loads -> grid tabpanel appears.
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
  });

  it('auto-opens the create form when there are no shelves', () => {
    renderWithProviders(<ShelfLayoutEditor initialShelves={[]} initialUnplaced={[]} />);
    expect(screen.getByText('Aucune étagère encore. Crée la première pour commencer.')).toBeTruthy();
    expect(screen.getByPlaceholderText(/Nom \(ex/)).toBeTruthy();
  });

  it('creates a new shelf via POST and selects it', async () => {
    const created = bareUnit({ id: 7, name: 'Studio New' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves' && init?.method === 'POST') return json({ shelf: created });
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail) return json({ shelf: bareUnit({ id: Number(detail[1]) }), slots: [], displays: [] });
      return json({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[]} initialUnplaced={[]} />);
    const input = screen.getByPlaceholderText(/Nom \(ex/);
    fireEvent.change(input, { target: { value: 'Studio New' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Studio New/ })).toBeTruthy());
    const postCall = fetchMock.mock.calls.find(([u, i]) => u === '/api/shelves' && (i as RequestInit)?.method === 'POST');
    expect(postCall).toBeTruthy();
  });

  it('toasts when shelf creation fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves' && init?.method === 'POST') return json({ error: 'create-failed' }, 500);
      return json({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[]} initialUnplaced={[]} />);
    fireEvent.change(screen.getByPlaceholderText(/Nom \(ex/), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    // handleCreate throws with the raw response text as the message.
    await waitFor(() => expect(document.body.textContent).toContain('create-failed'));
  });

  it('toggles the create form open and closed via the New shelf button', async () => {
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    expect(screen.queryByPlaceholderText(/Nom \(ex/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle étagère' }));
    expect(screen.getByPlaceholderText(/Nom \(ex/)).toBeTruthy();
  });

  it('cancels shelf creation with Escape, clears the name, then creates with Enter', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves' && init?.method === 'POST') return json({ shelf: bareUnit({ id: 8, name: 'Keyboard Shelf' }) });
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail) return json({ shelf: bareUnit({ id: Number(detail[1]), name: `Shelf ${detail[1]}` }), slots: [], displays: [] });
      return json({ shelves: [unit()] });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle étagère' }));
    const input = screen.getByPlaceholderText(/Nom \(ex/);
    fireEvent.change(input, { target: { value: 'Draft' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByPlaceholderText(/Nom \(ex/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle étagère' }));
    const reopened = screen.getByPlaceholderText(/Nom \(ex/) as HTMLInputElement;
    expect(reopened.value).toBe('');
    fireEvent.change(reopened, { target: { value: 'Keyboard Shelf' } });
    fireEvent.keyDown(reopened, { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('tab', { name: /Keyboard Shelf/ })).toBeTruthy());
    const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/shelves' && init?.method === 'POST');
    expect(post).toBeTruthy();
  });

  it('pages to the next shelf with the carousel buttons', async () => {
    const shelves = [unit({ id: 1, name: 'Studio X' }), unit({ id: 2, name: 'Studio W' })];
    global.fetch = defaultFetch(shelves) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={shelves} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    const tabX = screen.getByRole('tab', { name: /Studio X/ });
    expect(tabX.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Étagère suivante' }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Studio W/ }).getAttribute('aria-selected')).toBe('true'),
    );
  });

  it('pages shelves with ArrowLeft / ArrowRight keyboard shortcuts', async () => {
    const shelves = [unit({ id: 1, name: 'Studio X' }), unit({ id: 2, name: 'Studio W' })];
    global.fetch = defaultFetch(shelves) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={shelves} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Studio W/ }).getAttribute('aria-selected')).toBe('true'),
    );
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Studio X/ }).getAttribute('aria-selected')).toBe('true'),
    );
  });

  it('pages shelves with the tablist keyboard model', async () => {
    const shelves = [
      unit({ id: 1, name: 'Studio X' }),
      unit({ id: 2, name: 'Studio W' }),
      unit({ id: 3, name: 'Studio V' }),
    ];
    global.fetch = defaultFetch(shelves) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={shelves} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    const tablist = screen.getByRole('tablist');

    fireEvent.keyDown(tablist, { key: 'End' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Studio V/ }).getAttribute('aria-selected')).toBe('true'),
    );
    fireEvent.keyDown(tablist, { key: 'Home' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Studio X/ }).getAttribute('aria-selected')).toBe('true'),
    );
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Studio W/ }).getAttribute('aria-selected')).toBe('true'),
    );
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Studio X/ }).getAttribute('aria-selected')).toBe('true'),
    );
    fireEvent.keyDown(tablist, { key: 'Tab' });
    expect(screen.getByRole('tab', { name: /Studio X/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('switches the active shelf by clicking a tab', async () => {
    const shelves = [unit({ id: 1, name: 'Studio X' }), unit({ id: 2, name: 'Studio W' })];
    global.fetch = defaultFetch(shelves) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={shelves} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: /Studio W/ }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Studio W/ }).getAttribute('aria-selected')).toBe('true'),
    );
  });

  it('resizes the shelf when the increment-columns button is clicked', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail && init?.method === 'PATCH') {
        return json({ shelf: bareUnit({ cols: 3, rows: 2 }), slots: [], evicted: [] });
      }
      if (detail) return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une colonne' }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'PATCH');
      expect(patch).toBeTruthy();
    });
  });

  it('refreshes the pool and warns when resizing evicts editions', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves?pool=1') {
        return json({
          shelves: [unit({ rows: 1, placed_count: 0 })],
          unplaced: [poolEntry({ vn_id: 'v90009', release_id: 'r90009', vn_title: 'Evicted Edition' })],
        });
      }
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail && init?.method === 'PATCH') {
        return json({
          shelf: bareUnit({ rows: 1 }),
          slots: [],
          evicted: [{ vn_id: 'v90009', release_id: 'r90009' }],
        });
      }
      if (detail) return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ shelves: [unit()] });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit({ rows: 2 })]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Retirer une ligne' }));
    await waitFor(() => expect(document.body.textContent).toContain('1 édition(s) évincée(s)'));
    await waitFor(() => expect(screen.getAllByText('Evicted Edition').length).toBeGreaterThan(0));
  });

  it('toasts when resizing fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail && init?.method === 'PATCH') return json({ error: 'resize-failed' }, 500);
      if (detail) return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ shelves: [unit()] });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    await waitFor(() => expect(document.body.textContent).toContain('resize-failed'));
  });

  it('renames the active shelf through the prompt dialog', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail && init?.method === 'PATCH') return json({ ok: true });
      if (detail) return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Renommer$/ }));
    // The prompt modal renders as a dialog with an input labelled by its title.
    const promptDialog = await screen.findByRole('dialog');
    const promptInput = within(promptDialog).getByRole('textbox');
    fireEvent.change(promptInput, { target: { value: 'Renamed Shelf' } });
    // Confirm button inside the prompt modal carries the "Renommer" label.
    fireEvent.click(within(promptDialog).getByRole('button', { name: 'Renommer' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Renamed Shelf/ })).toBeTruthy());
  });

  it('does not PATCH when shelf rename is cancelled', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail) return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Renommer$/ }));
    const promptDialog = await screen.findByRole('dialog');
    fireEvent.click(within(promptDialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it('toasts when shelf rename fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail && init?.method === 'PATCH') return json({ error: 'rename-failed' }, 500);
      if (detail) return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Renommer$/ }));
    const promptDialog = await screen.findByRole('dialog');
    const promptInput = within(promptDialog).getByRole('textbox');
    fireEvent.change(promptInput, { target: { value: 'Broken Rename' } });
    fireEvent.click(within(promptDialog).getByRole('button', { name: 'Renommer' }));
    await waitFor(() => expect(document.body.textContent).toContain('rename-failed'));
  });

  it('deletes the active shelf after confirmation', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail && init?.method === 'DELETE') return json({ ok: true });
      if (detail) return json({ shelf: bareUnit(), slots: [], displays: [] });
      if (url.includes('pool=1')) return json({ shelves: [], unplaced: [] });
      return json({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Supprimer$/ }));
    // Danger confirm renders as an alertdialog; its confirm button is "Supprimer".
    const confirmModal = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmModal).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(screen.queryByRole('tab', { name: /Studio X/ })).toBeNull());
  });

  it('does not DELETE when shelf deletion is cancelled', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail) return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Supprimer$/ }));
    const confirmModal = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmModal).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });

  it('toasts when shelf deletion fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail && init?.method === 'DELETE') return json({ error: 'delete-failed' }, 500);
      if (detail) return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Supprimer$/ }));
    const confirmModal = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmModal).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(document.body.textContent).toContain('delete-failed'));
  });

  it('toggles the front-display visibility button', async () => {
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    const btn = screen.getByRole('button', { name: 'Présentation frontale' });
    fireEvent.click(btn);
    // Front-display rows still toggle without throwing; the grid stays mounted.
    expect(screen.getByRole('tabpanel')).toBeTruthy();
  });

  it('opens the fullscreen overlay and exposes a dialog', async () => {
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Plein écran' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    // Escape closes it.
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('renders the unplaced pool with a draggable item', async () => {
    renderWithProviders(
      <ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[poolEntry()]} />,
    );
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    // The pool item surfaces the VN title (via the mocked SafeImage alt + text).
    expect(screen.getAllByText('Title Y').length).toBeGreaterThanOrEqual(1);
    // The distinguisher line surfaces the edition label.
    expect(screen.getByText('Limited')).toBeTruthy();
  });

  it('shows the empty-pool hint when nothing is unplaced', async () => {
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    expect(
      screen.getByText('Tout est placé. Ajoute des éditions depuis la fiche d\'un VN pour les voir ici.'),
    ).toBeTruthy();
  });

  it('toasts when the active-shelf detail load fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (/\/api\/shelves\/\d+$/.test(url)) return json({ error: 'detail-load-failed' }, 500);
      return json({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />);
    await waitFor(() => expect(document.body.textContent).toContain('detail-load-failed'));
  });

  it('renders a skeleton grid while the active shelf detail is loading', () => {
    // A fetch that never resolves keeps activeState null -> skeleton shown.
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = renderWithProviders(
      <ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />,
    );
    // No tabpanel yet; the skeleton grid (animate-pulse blocks) renders.
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders placed slots and a face-out display item once the grid hydrates', async () => {
    global.fetch = fetchWithGrid([unit({ placed_count: 2 })], {
      1: {
        slots: [slot({ vn_id: 'v90001', release_id: 'r90001', vn_title: 'Title Y', box_type: 'dvd_case', dumped: true })],
        displays: [displaySlot({ vn_id: 'v90002', release_id: 'r90002', vn_title: 'Title Z' })],
      },
    }) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit({ placed_count: 2 })]} initialUnplaced={[]} />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    // Placed-cell link to the VN detail page (covers DraggableSlotItem +
    // the popover-data / artwork projection helpers).
    await waitFor(() => {
      const slotLinks = screen.getAllByRole('link', { name: 'Title Y' });
      expect(slotLinks.length).toBeGreaterThanOrEqual(1);
    });
    // Display item link (covers DraggableDisplayItem + displaySlotToPopoverData).
    const displayLinks = screen.getAllByRole('link', { name: 'Title Z' });
    expect(displayLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('honors the ?highlight search param by selecting the shelf holding that VN', async () => {
    vi.useFakeTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    const savedScroll = g.Element?.prototype?.scrollIntoView;
    const hadCss = 'CSS' in g;
    const savedCss = g.CSS;
    try {
      const scrollSpy = vi.fn();
      // jsdom elements lack scrollIntoView; stub it so the 120ms timer is safe.
      g.Element.prototype.scrollIntoView = scrollSpy;
      // This jsdom build has no CSS.escape; provide a minimal shim.
      g.CSS = { ...(savedCss ?? {}), escape: (s: string) => s.replace(/["\\]/g, '\\$&') };
      searchParamsValue = new URLSearchParams('highlight=v90042');
      const shelves = [unit({ id: 1, name: 'Studio X' }), unit({ id: 2, name: 'Studio W' })];
      global.fetch = fetchWithGrid(shelves, {
        2: { slots: [slot({ shelf_id: 2, vn_id: 'v90042', release_id: 'r90042', vn_title: 'Highlighted' })], displays: [] },
      }) as unknown as typeof fetch;
      const { container } = renderWithProviders(
        <ShelfLayoutEditor initialShelves={shelves} initialUnplaced={[]} />,
      );
      // Flush the highlight scan + active-shelf hydration so shelf 2 mounts
      // its grid (and the highlighted slot carries data-shelf-vn).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(
        screen.getByRole('tab', { name: /Studio W/ }).getAttribute('aria-selected'),
      ).toBe('true');
      expect(container.querySelector('[data-shelf-vn="v90042"]')).toBeTruthy();
      // Now run the 120ms scroll timer; the target element exists by here.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      expect(scrollSpy).toHaveBeenCalled();
    } finally {
      g.Element.prototype.scrollIntoView = savedScroll;
      if (hadCss) g.CSS = savedCss;
      else delete g.CSS;
      vi.useRealTimers();
    }
  });
});
