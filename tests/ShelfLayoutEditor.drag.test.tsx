// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
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
    const shelf = state.shelves[0] ?? unit();
    if (url === '/api/shelves?pool=1') {
      return json({ shelves: state.shelves, unplaced: state.pool });
    }
    if (url === '/api/shelves') {
      return json({ shelves: state.shelves });
    }
    if (url === '/api/shelves/1' && method === 'GET') {
      return json({ shelf: bareUnit(shelf), slots: state.slots, displays: state.displays });
    }
    if (url === '/api/shelves/1/slots' && method === 'POST') {
      if (state.failNextSlotPost) {
        state.failNextSlotPost = false;
        return json({ error: 'slot failed' }, 500);
      }
      const body = parseBody(init);
      const row = body.row ?? 0;
      const col = body.col ?? 0;
      const vnId = body.vn_id ?? 'v90001';
      const releaseId = body.release_id ?? 'r90001';
      const nextEntry = entryFromSource(vnId, releaseId, state);
      state.pool = state.pool.filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.displays = state.displays.filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.slots = state.slots
        .filter((entry) => !(entry.row === row && entry.col === col))
        .filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.slots.push(slotFromEntry(nextEntry, row, col));
      return json({ slots: state.slots });
    }
    if (url === '/api/shelves/1/displays' && method === 'POST') {
      const body = parseBody(init);
      const afterRow = body.after_row ?? 0;
      const position = body.position ?? 0;
      const vnId = body.vn_id ?? 'v90001';
      const releaseId = body.release_id ?? 'r90001';
      const nextEntry = entryFromSource(vnId, releaseId, state);
      state.pool = state.pool.filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.slots = state.slots.filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.displays = state.displays
        .filter((entry) => !(entry.after_row === afterRow && entry.position === position))
        .filter((entry) => !(entry.vn_id === vnId && entry.release_id === releaseId));
      state.displays.push(displayFromEntry(nextEntry, afterRow, position));
      return json({ ok: true });
    }
    if (url === '/api/shelves/1/slots' && method === 'DELETE') {
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
  renderWithProviders(<ShelfLayoutEditor initialShelves={state.shelves} initialUnplaced={state.pool} />);
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
