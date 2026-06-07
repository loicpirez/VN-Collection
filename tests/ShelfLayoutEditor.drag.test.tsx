// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderWithProviders } from './helpers/render-component';
import type { ShelfDisplaySlotEntry, ShelfEntry, ShelfSlotEntry, ShelfUnit, ShelfUnitWithCount } from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';

let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/shelf',
  useSearchParams: () => searchParamsValue,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({
    alt,
    src,
    localSrc,
  }: {
    alt: string;
    src: string | null;
    localSrc?: string | null;
  }) => <span data-mock-safe-image={src ?? localSrc ?? ''}>{alt}</span>,
}));

vi.mock('@/components/EditionInfoPopover', () => ({
  EditionInfoTrigger: ({ data }: { data: { vn_title: string; release_id: string } }) => (
    <span data-mock-edition-info={`${data.vn_title}:${data.release_id}`} />
  ),
}));

type DndStart = { active: { id: string } };
type DndEnd = { active: { id: string }; over: { id: string } | null };
type DndHandlers = {
  onDragStart?: (event: DndStart) => void;
  onDragEnd?: (event: DndEnd) => void | Promise<void>;
  onDragCancel?: () => void;
};

const dnd = vi.hoisted(() => ({
  handlers: {} as DndHandlers,
  overIds: new Set<string>(),
  draggingIds: new Set<string>(),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragStart,
    onDragEnd,
    onDragCancel,
  }: {
    children: ReactNode;
    onDragStart?: (event: DndStart) => void;
    onDragEnd?: (event: DndEnd) => void | Promise<void>;
    onDragCancel?: () => void;
  }) => {
    dnd.handlers = { onDragStart, onDragEnd, onDragCancel };
    return <div data-testid="dnd-context">{children}</div>;
  },
  DragOverlay: ({ children }: { children: ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
  KeyboardSensor: function KeyboardSensor() {},
  PointerSensor: function PointerSensor() {},
  TouchSensor: function TouchSensor() {},
  pointerWithin: vi.fn(),
  useSensor: vi.fn((sensor: unknown, config?: unknown) => ({ sensor, config })),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
  useDroppable: ({ id }: { id: string }) => ({
    isOver: dnd.overIds.has(id),
    setNodeRef: vi.fn(),
  }),
  useDraggable: ({ id }: { id: string }) => ({
    isDragging: dnd.draggingIds.has(id),
    setNodeRef: vi.fn(),
    attributes: { 'data-draggable-id': id },
    listeners: { onPointerDown: vi.fn() },
  }),
}));

import { ShelfLayoutEditor } from '@/components/ShelfLayoutEditor';

const originalFetch = global.fetch;
const t = dictionaries.en;

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
  const { placed_count: _placedCount, ...rest } = unit(overrides as Partial<ShelfUnitWithCount>);
  void _placedCount;
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
    vn_image_url: 'https://example.test/vn.jpg',
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

function normalizeBoxType(value: ShelfEntry['box_type']): ShelfSlotEntry['box_type'] {
  switch (value) {
    case 'small':
    case 'medium':
    case 'large':
    case 'tall':
    case 'dvd_case':
    case 'special_edition':
    case 'other':
    case 'none':
      return value;
    default:
      return 'none';
  }
}

function slot(overrides: Partial<ShelfSlotEntry> = {}): ShelfSlotEntry {
  const {
    notes: _notes,
    location: _location,
    added_at: _addedAt,
    rel_minage: _relMinage,
    rel_patch: _relPatch,
    rel_freeware: _relFreeware,
    rel_official: _relOfficial,
    rel_has_ero: _relHasEro,
    ...base
  } = poolEntry(overrides);
  void [_notes, _location, _addedAt, _relMinage, _relPatch, _relFreeware, _relOfficial, _relHasEro];
  return {
    ...base,
    shelf_id: 1,
    row: 0,
    col: 0,
    box_type: normalizeBoxType(base.box_type),
    ...overrides,
  };
}

function displaySlot(overrides: Partial<ShelfDisplaySlotEntry> = {}): ShelfDisplaySlotEntry {
  return {
    ...slot(overrides),
    after_row: 0,
    position: 0,
    placed_at: 1,
    ...overrides,
  } as ShelfDisplaySlotEntry;
}

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface ShelfServerState {
  shelves: ShelfUnitWithCount[];
  slots: ShelfSlotEntry[];
  displays: ShelfDisplaySlotEntry[];
  pool: ShelfEntry[];
  failNextSlotPost?: boolean;
  failNextDisplayPost?: boolean;
  failNextDelete?: boolean;
  emptyNextSlotPost?: boolean;
  emptyNextDisplayPost?: boolean;
  emptyNextDelete?: boolean;
  malformedNextSlotPost?: boolean;
  holdNextSlotPost?: DeferredResponse;
  holdNextDisplayPost?: DeferredResponse;
  holdNextDelete?: DeferredResponse;
  holdNextDetail?: DeferredResponse;
  holdNextPoolRefresh?: DeferredResponse;
  holdNextMetaRefresh?: DeferredResponse;
  failPoolRefresh?: boolean;
  malformedPoolRefresh?: boolean;
  omitPoolUnplaced?: boolean;
  failMetaRefresh?: boolean;
  malformedMetaRefresh?: boolean;
  failNextDetailRefresh?: boolean;
  malformedNextDetailRefresh?: boolean;
}

interface DeferredResponse {
  promise: Promise<Response>;
  resolve(value: Response): void;
}

function deferredResponse(): DeferredResponse {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function delayedJsonResponse(): DeferredResponse & { resolveJson(value: unknown): void; jsonRequested: () => boolean } {
  let resolveJson!: (value: unknown) => void;
  let requested = false;
  const response = {
    ok: true,
    json: () => {
      requested = true;
      return new Promise<unknown>((resolve) => {
        resolveJson = resolve;
      });
    },
    text: async () => '',
  } as Response;
  return {
    promise: Promise.resolve(response),
    resolve: () => undefined,
    resolveJson: (value: unknown) => resolveJson(value),
    jsonRequested: () => requested,
  };
}

function parseBody(init: RequestInit | undefined): {
  row?: number;
  col?: number;
  after_row?: number;
  position?: number;
  vn_id?: string;
  release_id?: string;
} {
  if (typeof init?.body !== 'string') return {};
  const parsed: {
    row?: number;
    col?: number;
    after_row?: number;
    position?: number;
    vn_id?: string;
    release_id?: string;
  } = JSON.parse(init.body);
  return parsed;
}

function entryFromSource(vnId: string, releaseId: string, state: ShelfServerState): ShelfEntry {
  const fromPool = state.pool.find((entry) => entry.vn_id === vnId && entry.release_id === releaseId);
  if (fromPool) return fromPool;
  const fromSlot = state.slots.find((entry) => entry.vn_id === vnId && entry.release_id === releaseId);
  if (fromSlot) return shelfSlotToEntry(fromSlot);
  const fromDisplay = state.displays.find((entry) => entry.vn_id === vnId && entry.release_id === releaseId);
  if (fromDisplay) return shelfDisplayToEntry(fromDisplay);
  return poolEntry({ vn_id: vnId, release_id: releaseId, vn_title: vnId });
}

function slotFromEntry(entry: ShelfEntry, row: number, col: number): ShelfSlotEntry {
  return {
    ...entry,
    shelf_id: 1,
    row,
    col,
    box_type: normalizeBoxType(entry.box_type),
  };
}

function displayFromEntry(entry: ShelfEntry, afterRow: number, position: number): ShelfDisplaySlotEntry {
  return {
    ...slotFromEntry(entry, 0, 0),
    after_row: afterRow,
    position,
    placed_at: 2,
  };
}

function shelfSlotToEntry(entry: ShelfSlotEntry): ShelfEntry {
  return {
    ...entry,
    notes: null,
    location: 'unknown',
    added_at: 0,
    rel_minage: null,
    rel_patch: false,
    rel_freeware: false,
    rel_official: true,
    rel_has_ero: false,
  };
}

function shelfDisplayToEntry(entry: ShelfDisplaySlotEntry): ShelfEntry {
  return {
    ...entry,
    notes: null,
    location: 'unknown',
    added_at: 0,
    rel_minage: null,
    rel_patch: false,
    rel_freeware: false,
    rel_official: true,
    rel_has_ero: false,
  };
}

function installShelfServer(state: ShelfServerState) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const shelfMatch = url.match(/^\/api\/shelves\/(\d+)(?:\/(slots|displays))?$/);
    const shelfId = shelfMatch ? Number(shelfMatch[1]) : 1;
    const shelf = state.shelves.find((entry) => entry.id === shelfId) ?? state.shelves[0] ?? unit({ id: shelfId });
    if (url === '/api/shelves?pool=1') {
      if (state.holdNextPoolRefresh) {
        const pending = state.holdNextPoolRefresh;
        state.holdNextPoolRefresh = undefined;
        return pending.promise;
      }
      if (state.failPoolRefresh) {
        state.failPoolRefresh = false;
        return json({ error: 'pool refresh failed' }, 500);
      }
      if (state.malformedPoolRefresh) {
        state.malformedPoolRefresh = false;
        return json({ shelves: null });
      }
      if (state.omitPoolUnplaced) {
        state.omitPoolUnplaced = false;
        return json({ shelves: state.shelves });
      }
      return json({ shelves: state.shelves, unplaced: state.pool });
    }
    if (url === '/api/shelves' && method === 'GET') {
      if (state.holdNextMetaRefresh) {
        const pending = state.holdNextMetaRefresh;
        state.holdNextMetaRefresh = undefined;
        return pending.promise;
      }
      if (state.failMetaRefresh) {
        state.failMetaRefresh = false;
        return json({ error: 'meta refresh failed' }, 500);
      }
      if (state.malformedMetaRefresh) {
        state.malformedMetaRefresh = false;
        return json({ shelves: null });
      }
      return json({ shelves: state.shelves });
    }
    if (url === '/api/shelves' && method === 'POST') {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { name?: string };
      const nextShelf = unit({
        id: Math.max(0, ...state.shelves.map((entry) => entry.id)) + 1,
        name: body.name ?? 'New shelf',
        order_index: state.shelves.length,
      });
      state.shelves.push(nextShelf);
      return json({ shelf: bareUnit(nextShelf) });
    }
    if (shelfMatch && !shelfMatch[2] && method === 'GET') {
      if (state.holdNextDetail) {
        const pending = state.holdNextDetail;
        state.holdNextDetail = undefined;
        return pending.promise;
      }
      if (state.failNextDetailRefresh) {
        state.failNextDetailRefresh = false;
        return json({ error: 'detail refresh failed' }, 500);
      }
      if (state.malformedNextDetailRefresh) {
        state.malformedNextDetailRefresh = false;
        return json({ shelf: bareUnit(shelf), slots: null, displays: [] });
      }
      return json({ shelf: bareUnit(shelf), slots: state.slots, displays: state.displays });
    }
    if (shelfMatch && !shelfMatch[2] && method === 'PATCH') {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { name?: string; cols?: number; rows?: number };
      const index = state.shelves.findIndex((entry) => entry.id === shelfId);
      const current = index >= 0 ? state.shelves[index] : shelf;
      const nextShelf = {
        ...current,
        name: body.name ?? current.name,
        cols: body.cols ?? current.cols,
        rows: body.rows ?? current.rows,
      };
      if (index >= 0) state.shelves[index] = nextShelf;
      if (typeof body.cols === 'number' || typeof body.rows === 'number') {
        state.slots = state.slots.filter((entry) => entry.col < nextShelf.cols && entry.row < nextShelf.rows);
        state.displays = state.displays.filter((entry) => entry.position < nextShelf.cols && entry.after_row <= nextShelf.rows);
        return json({ shelf: bareUnit(nextShelf), slots: state.slots, evicted: [] });
      }
      return json({ shelf: bareUnit(nextShelf) });
    }
    if (shelfMatch && !shelfMatch[2] && method === 'DELETE') {
      state.shelves = state.shelves.filter((entry) => entry.id !== shelfId);
      state.slots = state.slots.filter((entry) => entry.shelf_id !== shelfId);
      state.displays = state.displays.filter((entry) => entry.shelf_id !== shelfId);
      return json({ ok: true });
    }
    if (shelfMatch && shelfMatch[2] === 'slots' && method === 'POST') {
      if (state.holdNextSlotPost) {
        const pending = state.holdNextSlotPost;
        state.holdNextSlotPost = undefined;
        return pending.promise;
      }
      if (state.failNextSlotPost) {
        state.failNextSlotPost = false;
        return json({ error: 'slot failed' }, 500);
      }
      if (state.emptyNextSlotPost) {
        state.emptyNextSlotPost = false;
        return new Response('', { status: 500 });
      }
      if (state.malformedNextSlotPost) {
        state.malformedNextSlotPost = false;
        return json({ ok: true });
      }
      const body = parseBody(init);
      const row = body.row ?? 0;
      const col = body.col ?? 0;
      const vnId = body.vn_id ?? 'v90001';
      const releaseId = body.release_id ?? 'r90001';
      const nextEntry = entryFromSource(vnId, releaseId, state);
      const displaced = state.slots.find((entry) =>
        entry.row === row &&
        entry.col === col &&
        !(entry.vn_id === vnId && entry.release_id === releaseId));
      if (displaced) state.pool.push(shelfSlotToEntry(displaced));
      state.pool = state.pool.filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.displays = state.displays.filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.slots = state.slots
        .filter((entry) => !(entry.row === row && entry.col === col))
        .filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.slots.push({ ...slotFromEntry(nextEntry, row, col), shelf_id: shelfId });
      return json({ slots: state.slots });
    }
    if (shelfMatch && shelfMatch[2] === 'displays' && method === 'POST') {
      if (state.holdNextDisplayPost) {
        const pending = state.holdNextDisplayPost;
        state.holdNextDisplayPost = undefined;
        return pending.promise;
      }
      if (state.failNextDisplayPost) {
        state.failNextDisplayPost = false;
        return json({ error: 'display failed' }, 500);
      }
      if (state.emptyNextDisplayPost) {
        state.emptyNextDisplayPost = false;
        return new Response('', { status: 500 });
      }
      const body = parseBody(init);
      const afterRow = body.after_row ?? 0;
      const position = body.position ?? 0;
      const vnId = body.vn_id ?? 'v90001';
      const releaseId = body.release_id ?? 'r90001';
      const nextEntry = entryFromSource(vnId, releaseId, state);
      const displaced = state.displays.find((entry) =>
        entry.after_row === afterRow &&
        entry.position === position &&
        !(entry.vn_id === vnId && entry.release_id === releaseId));
      if (displaced) state.pool.push(shelfDisplayToEntry(displaced));
      state.pool = state.pool.filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.slots = state.slots.filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.displays = state.displays
        .filter((entry) => !(entry.after_row === afterRow && entry.position === position))
        .filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.displays.push({ ...displayFromEntry(nextEntry, afterRow, position), shelf_id: shelfId });
      return json({ ok: true });
    }
    if (shelfMatch && shelfMatch[2] === 'slots' && method === 'DELETE') {
      if (state.holdNextDelete) {
        const pending = state.holdNextDelete;
        state.holdNextDelete = undefined;
        return pending.promise;
      }
      if (state.failNextDelete) {
        state.failNextDelete = false;
        return json({ error: 'delete failed' }, 500);
      }
      if (state.emptyNextDelete) {
        state.emptyNextDelete = false;
        return new Response('', { status: 500 });
      }
      const body = parseBody(init);
      const vnId = body.vn_id ?? '';
      const releaseId = body.release_id ?? '';
      const sourceEntry = entryFromSource(vnId, releaseId, state);
      state.slots = state.slots.filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.displays = state.displays.filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.pool.push(sourceEntry);
      return json({ ok: true });
    }
    return json({ ok: true });
  });
  global.fetch = fetchMock;
  return fetchMock;
}

async function renderLoaded(state: ShelfServerState) {
  const fetchMock = installShelfServer(state);
  renderWithProviders(<ShelfLayoutEditor initialShelves={state.shelves} initialUnplaced={state.pool} />, { locale: 'en' });
  await screen.findByRole('tabpanel');
  return fetchMock;
}

async function drag(activeId: string, overId: string | null) {
  await act(async () => {
    dnd.handlers.onDragStart?.({ active: { id: activeId } });
  });
  await act(async () => {
    await dnd.handlers.onDragEnd?.({ active: { id: activeId }, over: overId ? { id: overId } : null });
  });
}

describe('ShelfLayoutEditor drag operations', () => {
  beforeEach(() => {
    searchParamsValue = new URLSearchParams();
    dnd.handlers = {};
    dnd.overIds.clear();
    dnd.draggingIds.clear();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('creates the first shelf and cancels a draft create form', async () => {
    const state: ShelfServerState = {
      shelves: [],
      slots: [],
      displays: [],
      pool: [],
    };
    const fetchMock = installShelfServer(state);
    renderWithProviders(<ShelfLayoutEditor initialShelves={[]} initialUnplaced={[]} />, { locale: 'en' });
    expect(screen.getByText(t.shelfLayout.noShelves)).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: t.shelfLayout.newShelfName });
    expect(screen.getByRole('button', { name: new RegExp(t.shelfLayout.create) })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'First shelf' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/shelves' && init?.method === 'POST')).toBe(true);
    });
    await screen.findByRole('tab', { name: /First shelf/ });

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.shelfLayout.newShelf) }));
    const draftInput = screen.getByRole('textbox', { name: t.shelfLayout.newShelfName });
    fireEvent.change(draftInput, { target: { value: 'Draft shelf' } });
    const createPanel = draftInput.closest('div');
    if (!(createPanel instanceof HTMLElement)) throw new Error('missing create panel');
    fireEvent.click(within(createPanel).getByRole('button', { name: new RegExp(t.shelfLayout.cancel) }));
    expect(screen.queryByDisplayValue('Draft shelf')).toBeNull();
  });

  it('renames, resizes, and deletes an active shelf through the toolbar dialogs', async () => {
    const state: ShelfServerState = {
      shelves: [unit({ name: 'Studio X' }), unit({ id: 2, name: 'Spare', order_index: 1 })],
      slots: [slot({ vn_title: 'Kept slot' })],
      displays: [displaySlot({ vn_id: 'v90002', release_id: 'r90002', vn_title: 'Kept display', position: 1 })],
      pool: [],
    };
    const fetchMock = await renderLoaded(state);

    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.rename }));
    const promptDialog = await screen.findByRole('dialog');
    const promptInput = within(promptDialog).getByRole('textbox', { name: t.shelfLayout.rename });
    fireEvent.change(promptInput, { target: { value: 'Renamed shelf' } });
    fireEvent.click(within(promptDialog).getByRole('button', { name: t.shelfLayout.rename }));
    await screen.findByRole('tab', { name: /Renamed shelf/ });

    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.incrementCols }));
    await waitFor(() => expect(screen.getByText('3 x 2')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.decrementRows }));
    await waitFor(() => expect(screen.getByText('3 x 1')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.delete }));
    const deleteDialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(deleteDialog).getByRole('button', { name: t.shelfLayout.delete }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Spare/ })).toHaveAttribute('aria-selected', 'true');
    });
    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/shelves/1' && init?.method === 'DELETE')).toBe(true);
  });

  it('navigates shelves by toolbar and keyboard and toggles fullscreen/front-display modes', async () => {
    const state: ShelfServerState = {
      shelves: [unit({ name: 'Left' }), unit({ id: 2, name: 'Right', order_index: 1 })],
      slots: [],
      displays: [],
      pool: [],
    };
    await renderLoaded(state);

    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.nextShelf }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Right/ })).toHaveAttribute('aria-selected', 'true'));
    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.prevShelf }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Left/ })).toHaveAttribute('aria-selected', 'true'));
    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.nextShelf }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Right/ })).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.getByRole('tab', { name: /Left/ })).toHaveAttribute('aria-selected', 'true'));

    const tablist = screen.getByRole('tablist', { name: t.shelfLayout.pickShelf });
    fireEvent.keyDown(tablist, { key: 'End' });
    await waitFor(() => expect(screen.getByRole('tab', { name: /Right/ })).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(tablist, { key: 'Home' });
    await waitFor(() => expect(screen.getByRole('tab', { name: /Left/ })).toHaveAttribute('aria-selected', 'true'));

    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.fullscreen }));
    expect(screen.getByRole('dialog', { name: t.shelfLayout.exitFullscreen })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: t.shelfLayout.exitFullscreen })).toBeNull());

    expect(screen.getAllByText(t.shelfLayout.frontDisplayTop).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.shelfLayout.frontDisplay) }));
    expect(screen.queryByText(t.shelfLayout.frontDisplayTop)).toBeNull();
  });

  it('places a pooled edition into a shelf cell and shows the drag ghost while dragging', async () => {
    const state: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ owned_platform: 'win', rel_platforms: ['win'] })],
    };
    const fetchMock = await renderLoaded(state);

    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v90001|r90001' } });
    });
    expect(screen.getByTestId('drag-overlay')).toHaveTextContent('Title Y');
    await act(async () => {
      dnd.handlers.onDragCancel?.();
    });
    expect(screen.getByTestId('drag-overlay')).toBeEmptyDOMElement();

    await drag('pool|v90001|r90001', 'cell|1|0|1');

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/shelves/1/slots' && init?.method === 'POST')).toBe(true);
    });
    const postCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/shelves/1/slots' && init?.method === 'POST');
    expect(parseBody(postCall?.[1])).toMatchObject({ row: 0, col: 1, vn_id: 'v90001', release_id: 'r90001' });
    expect(screen.getAllByText('Title Y').length).toBeGreaterThan(0);
  });

  it('renders drag visuals, display labels, pool distinguishers, and clickable card links', async () => {
    searchParamsValue = new URLSearchParams('highlight=v90001');
    dnd.overIds.add('cell|1|0|1');
    dnd.overIds.add('display-cell|1|2|1');
    dnd.overIds.add('__pool__');
    dnd.draggingIds.add('slot|v90001|r90001|1|0|0');
    dnd.draggingIds.add('display|v90002|r90002|1|0|0');
    dnd.draggingIds.add('pool|v90006|r90006');
    const state: ShelfServerState = {
      shelves: [unit({ placed_count: 5 })],
      slots: [
        slot({
          vn_id: 'v90001',
          release_id: 'r90001',
          vn_title: 'Slotted Visual',
          box_type: 'other',
          dumped: true,
          rel_image_url: 'https://example.test/slot-release.jpg',
          vn_image_url: null,
          vn_image_thumb: 'https://example.test/slot-thumb.jpg',
        }),
      ],
      displays: [
        displaySlot({
          vn_id: 'v90002',
          release_id: 'r90002',
          vn_title: 'Display Top',
          after_row: 0,
          position: 0,
          dumped: true,
          rel_image_url: null,
          rel_image_thumb: 'https://example.test/display-thumb.jpg',
        }),
        displaySlot({
          vn_id: 'v90003',
          release_id: 'r90003',
          vn_title: 'Display Between',
          after_row: 1,
          position: 0,
          rel_image_url: null,
          rel_image_thumb: null,
          vn_image_url: null,
          vn_image_thumb: 'https://example.test/display-vn-thumb.jpg',
        }),
        displaySlot({
          vn_id: 'v90004',
          release_id: 'r90004',
          vn_title: 'Display Bottom',
          after_row: 2,
          position: 1,
          rel_image_url: null,
          rel_image_thumb: null,
          vn_image_url: null,
          vn_image_thumb: null,
        }),
      ],
      pool: [
        poolEntry({ vn_id: 'v90005', release_id: 'r90005', vn_title: 'Pool Platform', edition_label: null, owned_platform: 'win' }),
        poolEntry({ vn_id: 'v90006', release_id: 'r90006', vn_title: 'Pool Location', edition_label: null, physical_location: ['Shelf A'] }),
        poolEntry({ vn_id: 'v90007', release_id: 'r90007', vn_title: 'Pool Box', edition_label: null, box_type: 'large' }),
        poolEntry({ vn_id: 'v90008', release_id: 'r90008', vn_title: 'Pool Release', edition_label: null }),
        poolEntry({ vn_id: 'v90009', release_id: 'synthetic:v90009', vn_title: 'Pool Synthetic', edition_label: null }),
      ],
    };
    await renderLoaded(state);

    expect(screen.getAllByText(t.shelfLayout.frontDisplayTop).length).toBeGreaterThan(0);
    expect(screen.getAllByText(t.shelfLayout.frontDisplayBottom).length).toBeGreaterThan(0);
    expect(screen.getAllByText(
      t.shelfLayout.frontDisplayBetween.replace('{a}', '1').replace('{b}', '2'),
    ).length).toBeGreaterThan(0);
    expect(screen.getByText((t.boxTypes as Record<string, string>).other)).toBeTruthy();
    expect(screen.getByText('Windows')).toBeTruthy();
    expect(screen.getByText('Shelf A')).toBeTruthy();
    expect(screen.getByText('large')).toBeTruthy();
    expect(screen.getByText('r90008')).toBeTruthy();
    expect(screen.queryByText('synthetic:v90009')).toBeNull();

    const slotLink = screen.getByRole('link', { name: 'Slotted Visual' });
    fireEvent.click(slotLink);
    fireEvent.pointerDown(slotLink);
    const displayLink = screen.getByRole('link', { name: 'Display Top' });
    fireEvent.click(displayLink);
    fireEvent.pointerDown(displayLink);

    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v99999|r99999' } });
    });
    expect(screen.getByTestId('drag-overlay')).toBeEmptyDOMElement();
  });

  it('moves a shelf slot to the pool and rolls back a failed pooled placement', async () => {
    const state: ShelfServerState = {
      shelves: [unit({ placed_count: 1 })],
      slots: [slot({ vn_id: 'v90001', release_id: 'r90001', vn_title: 'Slotted' })],
      displays: [],
      pool: [poolEntry({ vn_id: 'v90002', release_id: 'r90002', vn_title: 'Pooled' })],
    };
    const fetchMock = await renderLoaded(state);

    await drag('slot|v90001|r90001|1|0|0', '__pool__');
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/shelves/1/slots' && init?.method === 'DELETE')).toBe(true);
    });
    expect(screen.getAllByText('Slotted').length).toBeGreaterThan(0);

    state.failNextSlotPost = true;
    await drag('pool|v90002|r90002', 'cell|1|1|1');
    expect(await screen.findByText(/slot failed/)).toBeTruthy();
    expect(screen.getAllByText('Pooled').length).toBeGreaterThan(0);
  });

  it('moves a slot to a front display, moves that display back to a cell, and unplaces a display', async () => {
    const state: ShelfServerState = {
      shelves: [unit({ placed_count: 1 })],
      slots: [slot({ vn_id: 'v90001', release_id: 'r90001', vn_title: 'Traveling' })],
      displays: [displaySlot({ vn_id: 'v90003', release_id: 'r90003', vn_title: 'Display-only', position: 1 })],
      pool: [],
    };
    const fetchMock = await renderLoaded(state);

    await drag('slot|v90001|r90001|1|0|0', 'display-cell|1|0|0');
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/shelves/1/displays' && init?.method === 'POST')).toBe(true);
    });
    expect(screen.getAllByText('Traveling').length).toBeGreaterThan(0);

    await drag('display|v90001|r90001|1|0|0', 'cell|1|1|0');
    await waitFor(() => {
      const slotPosts = fetchMock.mock.calls.filter(([url, init]) => url === '/api/shelves/1/slots' && init?.method === 'POST');
      expect(slotPosts.length).toBeGreaterThan(0);
    });

    await drag('display|v90003|r90003|1|0|1', '__pool__');
    await waitFor(() => {
      const deletes = fetchMock.mock.calls.filter(([url, init]) => url === '/api/shelves/1/slots' && init?.method === 'DELETE');
      expect(deletes.length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Display-only').length).toBeGreaterThan(0);
  });

  it('replaces occupied shelf cells from pool, slot, and display sources', async () => {
    const state: ShelfServerState = {
      shelves: [unit({ placed_count: 4 })],
      slots: [
        slot({ vn_id: 'v90001', release_id: 'r90001', vn_title: 'Slot A', row: 0, col: 0 }),
        slot({ vn_id: 'v90002', release_id: 'r90002', vn_title: 'Slot B', row: 0, col: 1 }),
        slot({ vn_id: 'v90003', release_id: 'r90003', vn_title: 'Slot C', row: 1, col: 0 }),
      ],
      displays: [displaySlot({ vn_id: 'v90004', release_id: 'r90004', vn_title: 'Display A' })],
      pool: [poolEntry({ vn_id: 'v90005', release_id: 'r90005', vn_title: 'Pool A' })],
    };
    const fetchMock = await renderLoaded(state);

    await drag('pool|v90005|r90005', 'cell|1|0|0');
    await drag('slot|v90002|r90002|1|0|1', 'cell|1|1|0');
    await drag('display|v90004|r90004|1|0|0', 'cell|1|0|1');

    const slotPosts = fetchMock.mock.calls.filter(([url, init]) => url === '/api/shelves/1/slots' && init?.method === 'POST');
    expect(slotPosts.map((call) => parseBody(call[1]))).toEqual([
      expect.objectContaining({ vn_id: 'v90005', release_id: 'r90005', row: 0, col: 0 }),
      expect.objectContaining({ vn_id: 'v90002', release_id: 'r90002', row: 1, col: 0 }),
      expect.objectContaining({ vn_id: 'v90004', release_id: 'r90004', row: 0, col: 1 }),
    ]);
    expect(screen.getAllByText('Slot A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Slot C').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Display A').length).toBeGreaterThan(0);
  });

  it('replaces occupied front-display cells from pool and slot sources', async () => {
    const state: ShelfServerState = {
      shelves: [unit({ placed_count: 4 })],
      slots: [slot({ vn_id: 'v90001', release_id: 'r90001', vn_title: 'Slot A', row: 0, col: 0 })],
      displays: [
        displaySlot({ vn_id: 'v90002', release_id: 'r90002', vn_title: 'Display A', after_row: 0, position: 0 }),
        displaySlot({ vn_id: 'v90003', release_id: 'r90003', vn_title: 'Display B', after_row: 0, position: 1 }),
      ],
      pool: [poolEntry({ vn_id: 'v90004', release_id: 'r90004', vn_title: 'Pool A' })],
    };
    const fetchMock = await renderLoaded(state);

    await drag('pool|v90004|r90004', 'display-cell|1|0|0');
    await drag('slot|v90001|r90001|1|0|0', 'display-cell|1|0|1');

    const displayPosts = fetchMock.mock.calls.filter(([url, init]) => url === '/api/shelves/1/displays' && init?.method === 'POST');
    expect(displayPosts.map((call) => parseBody(call[1]))).toEqual([
      expect.objectContaining({ vn_id: 'v90004', release_id: 'r90004', after_row: 0, position: 0 }),
      expect.objectContaining({ vn_id: 'v90001', release_id: 'r90001', after_row: 0, position: 1 }),
    ]);
    expect(screen.getAllByText('Display A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Display B').length).toBeGreaterThan(0);
  });

  it('rolls back failed display placement and failed unplacement mutations', async () => {
    const state: ShelfServerState = {
      shelves: [unit({ placed_count: 2 })],
      slots: [slot({ vn_id: 'v90001', release_id: 'r90001', vn_title: 'Slot A', row: 0, col: 0 })],
      displays: [displaySlot({ vn_id: 'v90002', release_id: 'r90002', vn_title: 'Display A', after_row: 0, position: 0 })],
      pool: [poolEntry({ vn_id: 'v90003', release_id: 'r90003', vn_title: 'Pool A' })],
      failNextDisplayPost: true,
    };
    await renderLoaded(state);

    await drag('pool|v90003|r90003', 'display-cell|1|0|1');
    expect(await screen.findByText(/display failed/)).toBeTruthy();
    expect(screen.getAllByText('Pool A').length).toBeGreaterThan(0);

    state.failNextDelete = true;
    await drag('slot|v90001|r90001|1|0|0', '__pool__');
    expect(await screen.findByText(/delete failed/)).toBeTruthy();
    expect(screen.getAllByText('Slot A').length).toBeGreaterThan(0);
  });

  it('does not update state when a slot placement completes after unmount', async () => {
    const pendingPost = deferredResponse();
    const state: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Pending pool' })],
      holdNextSlotPost: pendingPost,
    };
    installShelfServer(state);
    const view = renderWithProviders(<ShelfLayoutEditor initialShelves={state.shelves} initialUnplaced={state.pool} />, { locale: 'en' });
    await screen.findByRole('tabpanel');

    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v90001|r90001' } });
    });
    let pending: void | Promise<void>;
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'pool|v90001|r90001' },
        over: { id: 'cell|1|0|1' },
      });
    });
    view.unmount();
    pendingPost.resolve(json({ slots: [slot({ col: 1, vn_title: 'Resolved after unmount' })] }));
    await act(async () => {
      await pending;
    });
  });

  it('does not roll back or toast when a slot placement fails after unmount', async () => {
    const pendingPost = deferredResponse();
    const state: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Pending slot failure' })],
      holdNextSlotPost: pendingPost,
    };
    installShelfServer(state);
    const view = renderWithProviders(<ShelfLayoutEditor initialShelves={state.shelves} initialUnplaced={state.pool} />, { locale: 'en' });
    await screen.findByRole('tabpanel');

    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v90001|r90001' } });
    });
    let pending: void | Promise<void>;
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'pool|v90001|r90001' },
        over: { id: 'cell|1|0|1' },
      });
    });
    view.unmount();
    pendingPost.resolve(new Response('', { status: 500 }));
    await act(async () => {
      await pending;
    });
    expect(document.body.textContent).not.toContain(t.shelfLayout.saveFailed);
  });

  it('does not update state when display placement completes after unmount', async () => {
    const pendingPost = deferredResponse();
    const state: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Pending display' })],
      holdNextDisplayPost: pendingPost,
    };
    const view = await (async () => {
      installShelfServer(state);
      const rendered = renderWithProviders(<ShelfLayoutEditor initialShelves={state.shelves} initialUnplaced={state.pool} />, { locale: 'en' });
      await screen.findByRole('tabpanel');
      return rendered;
    })();

    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v90001|r90001' } });
    });
    let pending: void | Promise<void>;
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'pool|v90001|r90001' },
        over: { id: 'display-cell|1|0|1' },
      });
    });
    view.unmount();
    pendingPost.resolve(json({ ok: true }));
    await act(async () => {
      await pending;
    });
  });

  it('does not roll back or toast when display placement fails after unmount', async () => {
    const pendingPost = deferredResponse();
    const state: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Pending display failure' })],
      holdNextDisplayPost: pendingPost,
    };
    installShelfServer(state);
    const view = renderWithProviders(<ShelfLayoutEditor initialShelves={state.shelves} initialUnplaced={state.pool} />, { locale: 'en' });
    await screen.findByRole('tabpanel');

    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v90001|r90001' } });
    });
    let pending: void | Promise<void>;
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'pool|v90001|r90001' },
        over: { id: 'display-cell|1|0|1' },
      });
    });
    view.unmount();
    pendingPost.resolve(new Response('', { status: 500 }));
    await act(async () => {
      await pending;
    });
    expect(document.body.textContent).not.toContain(t.shelfLayout.saveFailed);
  });

  it('does not update state when unplacing completes after unmount', async () => {
    const pendingDelete = deferredResponse();
    const state: ShelfServerState = {
      shelves: [unit()],
      slots: [slot({ vn_title: 'Pending unplace' })],
      displays: [],
      pool: [],
      holdNextDelete: pendingDelete,
    };
    installShelfServer(state);
    const view = renderWithProviders(<ShelfLayoutEditor initialShelves={state.shelves} initialUnplaced={state.pool} />, { locale: 'en' });
    await screen.findByRole('tabpanel');

    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'slot|v90001|r90001|1|0|0' } });
    });
    let pending: void | Promise<void>;
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'slot|v90001|r90001|1|0|0' },
        over: { id: '__pool__' },
      });
    });
    view.unmount();
    pendingDelete.resolve(json({ ok: true }));
    await act(async () => {
      await pending;
    });
  });

  it('does not roll back or toast when unplacing fails after unmount', async () => {
    const pendingDelete = deferredResponse();
    const state: ShelfServerState = {
      shelves: [unit()],
      slots: [slot({ vn_title: 'Pending unplace failure' })],
      displays: [],
      pool: [],
      holdNextDelete: pendingDelete,
    };
    installShelfServer(state);
    const view = renderWithProviders(<ShelfLayoutEditor initialShelves={state.shelves} initialUnplaced={state.pool} />, { locale: 'en' });
    await screen.findByRole('tabpanel');

    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'slot|v90001|r90001|1|0|0' } });
    });
    let pending: void | Promise<void>;
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'slot|v90001|r90001|1|0|0' },
        over: { id: '__pool__' },
      });
    });
    view.unmount();
    pendingDelete.resolve(new Response('', { status: 500 }));
    await act(async () => {
      await pending;
    });
    expect(document.body.textContent).not.toContain(t.shelfLayout.saveFailed);
  });

  it('ignores drag targets when there is no active shelf', async () => {
    const state: ShelfServerState = {
      shelves: [],
      slots: [],
      displays: [],
      pool: [poolEntry()],
    };
    const fetchMock = installShelfServer(state);
    renderWithProviders(<ShelfLayoutEditor initialShelves={[]} initialUnplaced={state.pool} />, { locale: 'en' });

    await drag('pool|v90001|r90001', 'cell|1|0|0');
    await drag('pool|v90001|r90001', 'display-cell|1|0|0');
    await drag('slot|v90001|r90001|1|0|0', '__pool__');
    await drag('pool|v90001|r90001', 'not-a-cell');

    const mutatingCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST' || init?.method === 'DELETE');
    expect(mutatingCalls).toHaveLength(0);
  });

  it('handles slot and display drops while shelf detail is still loading', async () => {
    const pendingSlotDetail = deferredResponse();
    const slotState: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Loading slot pool' })],
      holdNextDetail: pendingSlotDetail,
    };
    installShelfServer(slotState);
    renderWithProviders(<ShelfLayoutEditor initialShelves={slotState.shelves} initialUnplaced={slotState.pool} />, { locale: 'en' });
    await drag('pool|v90001|r90001', 'cell|1|0|1');
    cleanup();
    pendingSlotDetail.resolve(json({ shelf: bareUnit(), slots: [], displays: [] }));

    const pendingDisplayDetail = deferredResponse();
    const displayState: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Loading display pool' })],
      holdNextDetail: pendingDisplayDetail,
    };
    installShelfServer(displayState);
    renderWithProviders(<ShelfLayoutEditor initialShelves={displayState.shelves} initialUnplaced={displayState.pool} />, { locale: 'en' });
    await drag('pool|v90001|r90001', 'display-cell|1|0|1');
    cleanup();
    pendingDisplayDetail.resolve(json({ shelf: bareUnit(), slots: [], displays: [] }));

    const pendingUnplaceDetail = deferredResponse();
    const unplaceState: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [],
      holdNextDetail: pendingUnplaceDetail,
    };
    installShelfServer(unplaceState);
    renderWithProviders(<ShelfLayoutEditor initialShelves={unplaceState.shelves} initialUnplaced={[]} />, { locale: 'en' });
    await drag('slot|v90001|r90001|1|0|0', '__pool__');
    cleanup();
    pendingUnplaceDetail.resolve(json({ shelf: bareUnit(), slots: [], displays: [] }));
  });

  it('keeps a missing source out of optimistic slot and display previews', async () => {
    const state: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [],
    };
    await renderLoaded(state);

    await drag('pool|v90999|r90999', 'cell|1|0|1');
    await drag('pool|v90998|r90998', 'display-cell|1|0|1');
    await drag('slot|v90997|r90997|1|0|0', 'cell|1|1|1');
    await drag('display|v90996|r90996|1|0|0', 'cell|1|1|0');

    expect(screen.getByRole('tabpanel')).toBeTruthy();
  });

  it('handles display-to-display moves and same-edition display occupants', async () => {
    const state: ShelfServerState = {
      shelves: [unit({ placed_count: 3 })],
      slots: [slot({ vn_id: 'v90001', release_id: 'r90001', vn_title: 'Duplicate Slot' })],
      displays: [
        displaySlot({ vn_id: 'v90001', release_id: 'r90001', vn_title: 'Duplicate Display', after_row: 0, position: 0 }),
        displaySlot({ vn_id: 'v90002', release_id: 'r90002', vn_title: 'Display Mover', after_row: 1, position: 0 }),
      ],
      pool: [],
    };
    const fetchMock = await renderLoaded(state);

    await drag('slot|v90001|r90001|1|0|0', 'display-cell|1|0|0');
    await drag('display|v90002|r90002|1|1|0', 'display-cell|1|2|1');

    const displayPosts = fetchMock.mock.calls.filter(([url, init]) => url === '/api/shelves/1/displays' && init?.method === 'POST');
    expect(displayPosts.length).toBeGreaterThanOrEqual(2);
  });

  it('reports malformed slot placement responses', async () => {
    const state: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Malformed slot pool' })],
      malformedNextSlotPost: true,
    };
    await renderLoaded(state);

    await drag('pool|v90001|r90001', 'cell|1|0|1');

    expect(await screen.findByText(t.shelfLayout.saveFailed)).toBeTruthy();
  });

  it('uses the generic save message for empty slot, display, and delete failures', async () => {
    const state: ShelfServerState = {
      shelves: [unit({ placed_count: 2 })],
      slots: [slot({ vn_id: 'v90001', release_id: 'r90001', vn_title: 'Slot Empty Error' })],
      displays: [displaySlot({ vn_id: 'v90002', release_id: 'r90002', vn_title: 'Display Empty Error' })],
      pool: [poolEntry({ vn_id: 'v90003', release_id: 'r90003', vn_title: 'Pool Empty Error' })],
    };
    await renderLoaded(state);

    state.emptyNextSlotPost = true;
    await drag('pool|v90003|r90003', 'cell|1|0|1');
    expect(await screen.findByText(t.shelfLayout.saveFailed)).toBeTruthy();

    state.emptyNextDisplayPost = true;
    await drag('slot|v90001|r90001|1|0|0', 'display-cell|1|0|1');
    expect((await screen.findAllByText(t.shelfLayout.saveFailed)).length).toBeGreaterThanOrEqual(2);

    state.emptyNextDelete = true;
    await drag('display|v90002|r90002|1|0|0', '__pool__');
    expect((await screen.findAllByText(t.shelfLayout.saveFailed)).length).toBeGreaterThanOrEqual(3);
  });

  it('ignores duplicate drags while a mutation is already in flight', async () => {
    const pendingPost = deferredResponse();
    const state: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Pending duplicate' })],
      holdNextSlotPost: pendingPost,
    };
    const fetchMock = await renderLoaded(state);

    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v90001|r90001' } });
    });
    let pending: void | Promise<void>;
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'pool|v90001|r90001' },
        over: { id: 'cell|1|0|1' },
      });
    });
    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v90001|r90001' } });
      await dnd.handlers.onDragEnd?.({
        active: { id: 'pool|v90001|r90001' },
        over: { id: 'cell|1|1|1' },
      });
    });
    fireEvent.keyDown(screen.getByRole('tablist', { name: t.shelfLayout.pickShelf }), { key: 'ArrowRight' });
    const slotPosts = fetchMock.mock.calls.filter(([url, init]) => url === '/api/shelves/1/slots' && init?.method === 'POST');
    expect(slotPosts).toHaveLength(1);
    pendingPost.resolve(json({ slots: [] }));
    await act(async () => {
      await pending;
    });
  });

  it('stops display placement and unplacement after aborted pool refreshes', async () => {
    const pendingDisplayPool = deferredResponse();
    const displayState: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Display pool abort' })],
      holdNextPoolRefresh: pendingDisplayPool,
    };
    const first = await renderLoaded(displayState);
    let pending: void | Promise<void>;
    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v90001|r90001' } });
    });
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'pool|v90001|r90001' },
        over: { id: 'display-cell|1|0|1' },
      });
    });
    await waitFor(() => expect(first.mock.calls.some(([url]) => url === '/api/shelves?pool=1')).toBe(true));
    cleanup();
    pendingDisplayPool.resolve(json({ shelves: displayState.shelves, unplaced: displayState.pool }));
    await act(async () => {
      await pending;
    });

    const pendingUnplacePool = deferredResponse();
    const unplaceState: ShelfServerState = {
      shelves: [unit()],
      slots: [slot({ vn_title: 'Unplace pool abort' })],
      displays: [],
      pool: [],
      holdNextPoolRefresh: pendingUnplacePool,
    };
    const second = await renderLoaded(unplaceState);
    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'slot|v90001|r90001|1|0|0' } });
    });
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'slot|v90001|r90001|1|0|0' },
        over: { id: '__pool__' },
      });
    });
    await waitFor(() => expect(second.mock.calls.some(([url]) => url === '/api/shelves?pool=1')).toBe(true));
    cleanup();
    pendingUnplacePool.resolve(json({ shelves: unplaceState.shelves, unplaced: unplaceState.pool }));
    await act(async () => {
      await pending;
    });
  });

  it('surfaces detail refresh failures after slot placement', async () => {
    const state: ShelfServerState = {
      shelves: [unit(), unit({ id: 2, name: 'Second', order_index: 1 })],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Detail failure pool' })],
    };
    await renderLoaded(state);
    state.failNextDetailRefresh = true;

    await drag('pool|v90001|r90001', 'cell|1|0|1');

    expect(await screen.findByText(/detail refresh failed/)).toBeTruthy();
  });

  it('refreshes shelf metadata across more than one shelf after slot placement', async () => {
    const state: ShelfServerState = {
      shelves: [unit(), unit({ id: 2, name: 'Second', order_index: 1 })],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Multi shelf refresh' })],
    };
    await renderLoaded(state);

    await drag('pool|v90001|r90001', 'cell|1|0|1');

    expect(screen.getByRole('tab', { name: /Second/ })).toBeTruthy();
  });

  it('surfaces malformed detail refreshes after slot placement', async () => {
    const state: ShelfServerState = {
      shelves: [unit(), unit({ id: 2, name: 'Second', order_index: 1 })],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Malformed detail pool' })],
    };
    await renderLoaded(state);
    state.malformedNextDetailRefresh = true;

    await drag('pool|v90001|r90001', 'cell|1|0|1');

    expect(await screen.findByText(t.shelfLayout.saveFailed)).toBeTruthy();
  });

  it('stops slot placement when optional pool and metadata refreshes are aborted', async () => {
    const pendingPool = deferredResponse();
    const poolState: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Pool abort' })],
      holdNextPoolRefresh: pendingPool,
    };
    let pending: void | Promise<void>;
    const first = await renderLoaded(poolState);
    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v90001|r90001' } });
    });
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'pool|v90001|r90001' },
        over: { id: 'cell|1|0|1' },
      });
    });
    await waitFor(() => expect(first.mock.calls.some(([url]) => url === '/api/shelves?pool=1')).toBe(true));
    cleanup();
    pendingPool.resolve(json({ shelves: poolState.shelves, unplaced: poolState.pool }));
    await act(async () => {
      await pending;
    });

    const pendingMeta = deferredResponse();
    const metaState: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Meta abort' })],
      holdNextMetaRefresh: pendingMeta,
    };
    const second = await renderLoaded(metaState);
    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v90001|r90001' } });
    });
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'pool|v90001|r90001' },
        over: { id: 'cell|1|0|1' },
      });
    });
    await waitFor(() => expect(second.mock.calls.some(([url]) => url === '/api/shelves')).toBe(true));
    cleanup();
    pendingMeta.resolve(json({ shelves: metaState.shelves }));
    await act(async () => {
      await pending;
    });
  });

  it('stops a slot placement after the active shelf refresh is aborted', async () => {
    const pendingDetail = deferredResponse();
    const state: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Pending detail' })],
    };
    const fetchMock = await renderLoaded(state);
    state.holdNextDetail = pendingDetail;

    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v90001|r90001' } });
    });
    let pending: void | Promise<void>;
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'pool|v90001|r90001' },
        over: { id: 'cell|1|0|1' },
      });
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/shelves/1')).toBe(true);
      expect(state.holdNextDetail).toBeUndefined();
    });
    cleanup();
    pendingDetail.resolve(json({ shelf: bareUnit(), slots: state.slots, displays: state.displays }));
    await act(async () => {
      await pending;
    });
  });

  it('stops a slot placement when shelf detail JSON resolves after unmount', async () => {
    const pendingDetail = delayedJsonResponse();
    const state: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Delayed detail slot' })],
    };
    await renderLoaded(state);
    state.holdNextDetail = pendingDetail;

    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v90001|r90001' } });
    });
    let pending: void | Promise<void>;
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'pool|v90001|r90001' },
        over: { id: 'cell|1|0|1' },
      });
    });
    await waitFor(() => expect(pendingDetail.jsonRequested()).toBe(true));
    cleanup();
    pendingDetail.resolveJson({ shelf: bareUnit(), slots: state.slots, displays: state.displays });
    await act(async () => {
      await pending;
    });
  });

  it('stops display placement and unplacement after aborted shelf refreshes', async () => {
    const pendingDisplayDetail = deferredResponse();
    const displayState: ShelfServerState = {
      shelves: [unit()],
      slots: [],
      displays: [],
      pool: [poolEntry({ vn_title: 'Display refresh abort' })],
    };
    await renderLoaded(displayState);
    displayState.holdNextDetail = pendingDisplayDetail;
    let pending: void | Promise<void>;
    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'pool|v90001|r90001' } });
    });
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'pool|v90001|r90001' },
        over: { id: 'display-cell|1|0|1' },
      });
    });
    await waitFor(() => expect(displayState.holdNextDetail).toBeUndefined());
    cleanup();
    pendingDisplayDetail.resolve(json({ shelf: bareUnit(), slots: displayState.slots, displays: displayState.displays }));
    await act(async () => {
      await pending;
    });

    const pendingUnplaceDetail = deferredResponse();
    const unplaceState: ShelfServerState = {
      shelves: [unit()],
      slots: [slot({ vn_title: 'Unplace refresh abort' })],
      displays: [],
      pool: [],
    };
    await renderLoaded(unplaceState);
    unplaceState.holdNextDetail = pendingUnplaceDetail;
    await act(async () => {
      dnd.handlers.onDragStart?.({ active: { id: 'slot|v90001|r90001|1|0|0' } });
    });
    act(() => {
      pending = dnd.handlers.onDragEnd?.({
        active: { id: 'slot|v90001|r90001|1|0|0' },
        over: { id: '__pool__' },
      });
    });
    await waitFor(() => expect(unplaceState.holdNextDetail).toBeUndefined());
    cleanup();
    pendingUnplaceDetail.resolve(json({ shelf: bareUnit(), slots: unplaceState.slots, displays: unplaceState.displays }));
    await act(async () => {
      await pending;
    });
  });

  it('continues after optional pool and shelf metadata refresh failures', async () => {
    const cases: Array<Partial<ShelfServerState>> = [
      { failPoolRefresh: true },
      { malformedPoolRefresh: true },
      { omitPoolUnplaced: true },
      { failMetaRefresh: true },
      { malformedMetaRefresh: true },
    ];
    for (let index = 0; index < cases.length; index += 1) {
      const overrides = cases[index];
      cleanup();
      dnd.handlers = {};
      const state: ShelfServerState = {
        shelves: [unit()],
        slots: [],
        displays: [],
        pool: [poolEntry({ release_id: `r${90010 + index}`, vn_title: `Pool ${index}` })],
        ...overrides,
      };
      await renderLoaded(state);
      const entry = state.pool[0];
      if (!entry) throw new Error('missing pool entry');
      await drag(`pool|${entry.vn_id}|${entry.release_id}`, 'cell|1|0|1');
      expect(screen.getByRole('tabpanel')).toBeTruthy();
    }
  });

  it('ignores null, malformed, same-cell, same-display, and pool-to-pool drops', async () => {
    const state: ShelfServerState = {
      shelves: [unit({ placed_count: 2 })],
      slots: [slot({ vn_id: 'v90001', release_id: 'r90001', vn_title: 'Slotted' })],
      displays: [displaySlot({ vn_id: 'v90002', release_id: 'r90002', vn_title: 'Displayed' })],
      pool: [poolEntry({ vn_id: 'v90003', release_id: 'r90003', vn_title: 'Pooled' })],
    };
    const fetchMock = await renderLoaded(state);

    await drag('bad', 'cell|1|0|1');
    await drag('pool|v90003|r90003', null);
    await drag('pool|v90003|r90003', '__pool__');
    await drag('slot|v90001|r90001|1|0|0', 'cell|1|0|0');
    await drag('display|v90002|r90002|1|0|0', 'display-cell|1|0|0');

    const mutatingCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST' || init?.method === 'DELETE');
    expect(mutatingCalls).toHaveLength(0);
  });
});
