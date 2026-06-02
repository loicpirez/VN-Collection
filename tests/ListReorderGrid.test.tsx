// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { DragEndEvent } from '@dnd-kit/core';
import type { UniqueIdentifier } from '@dnd-kit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListReorderGrid, StubCard, type ListReorderItem } from '@/components/ListReorderGrid';
import type { CardData } from '@/components/VnCard';
import { renderWithProviders } from './helpers/render-component';

let capturedDragEnd: ((event: DragEndEvent) => void) | null = null;
let draggingId: UniqueIdentifier | null = null;
const sortableCalls: { id: UniqueIdentifier; disabled: boolean }[] = [];

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (event: DragEndEvent) => void }) => {
    capturedDragEnd = onDragEnd;
    return <div data-testid="dnd-context">{children}</div>;
  },
  KeyboardSensor: function KeyboardSensor() {},
  PointerSensor: function PointerSensor() {},
  TouchSensor: function TouchSensor() {},
  closestCenter: vi.fn(),
  useSensor: vi.fn((sensor, options) => ({ sensor, options })),
  useSensors: vi.fn((...sensors) => sensors),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  arrayMove: <T,>(items: T[], oldIndex: number, newIndex: number) => {
    const next = [...items];
    const [item] = next.splice(oldIndex, 1);
    if (item !== undefined) next.splice(newIndex, 0, item);
    return next;
  },
  rectSortingStrategy: {},
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: ({ id, disabled }: { id: UniqueIdentifier; disabled: boolean }) => {
    sortableCalls.push({ id, disabled });
    return {
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: draggingId === id,
    };
  },
}));

vi.mock('@/components/VnCard', () => ({
  VnCard: ({ data }: { data: CardData }) => <span>{`card:${data.id}`}</span>,
}));

vi.mock('@/components/ListRemoveVn', () => ({
  ListRemoveVn: ({ listId, vnId }: { listId: number; vnId: string }) => <span>{`remove:${listId}:${vnId}`}</span>,
}));

const props = {
  reorderHint: 'Drag to reorder',
  reorderKeyboardHint: 'Keyboard reorder help',
  errorLabel: 'Could not reorder',
};

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

function card(id: string): CardData {
  return {
    id,
    title: id,
    poster: null,
    released: null,
    rating: null,
  };
}

function item(vnId: string, withCard = false): ListReorderItem {
  return {
    vn_id: vnId,
    card: withCard ? card(vnId) : null,
  };
}

function dragEvent(activeId: UniqueIdentifier, overId: UniqueIdentifier | null): DragEndEvent {
  return {
    activatorEvent: new Event('pointerdown'),
    active: {
      id: activeId,
      data: { current: undefined },
      rect: { current: { initial: null, translated: null } },
    },
    collisions: null,
    delta: { x: 0, y: 0 },
    over: overId === null
      ? null
      : {
          id: overId,
          rect: new DOMRect(),
          disabled: false,
          data: { current: undefined },
        },
  };
}

function drag(activeId: UniqueIdentifier, overId: UniqueIdentifier | null) {
  if (!capturedDragEnd) throw new Error('Missing drag handler');
  act(() => capturedDragEnd?.(dragEvent(activeId, overId)));
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  capturedDragEnd = null;
  draggingId = null;
  sortableCalls.length = 0;
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ListReorderGrid', () => {
  it('renders card and stub variants with sortable affordances', () => {
    draggingId = 'v2';
    const { container } = renderWithProviders(
      <ListReorderGrid listId={7} items={[item('v1', true), item('v2')]} className="grid-class" style={{ gap: 3 }} {...props} />,
      { locale: 'en' },
    );
    expect(screen.getByText('Keyboard reorder help')).toBeInTheDocument();
    expect(screen.getByText('card:v1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'v2' })).toHaveAttribute('href', '/vn/v2');
    const cells = container.querySelectorAll('li');
    const firstCell = cells[0];
    if (!firstCell) throw new Error('Missing sortable cell');
    expect(firstCell).toHaveAttribute('title', 'Drag to reorder');
    expect(cells[1]).toHaveClass('opacity-40');
    expect(fireEvent.dragStart(firstCell)).toBe(false);
    expect(sortableCalls).toEqual([
      { id: 'v1', disabled: false },
      { id: 'v2', disabled: false },
    ]);
  });

  it('ignores incomplete, unchanged, missing, and locked drag results', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    renderWithProviders(<ListReorderGrid listId={7} items={[item('v1'), item('v2')]} {...props} />, { locale: 'en' });

    drag('v1', null);
    drag('v1', 'v1');
    drag('missing', 'v1');
    drag('v1', 'missing');
    expect(fetch).not.toHaveBeenCalled();
    drag('v1', 'v2');
    drag('v2', 'v1');
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(jsonResponse()));
  });

  it('persists optimistic reordering and clears its saving state', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const { container } = renderWithProviders(
      <ListReorderGrid listId={7} items={[item('v1'), item('v2'), item('v3')]} className="grid-class" {...props} />,
      { locale: 'en' },
    );
    drag('v1', 'v3');
    expect(fetch).toHaveBeenCalledWith('/api/lists/7/items', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ order: ['v2', 'v3', 'v1'] }),
    }));
    expect(container.querySelector('ul')).toHaveClass('opacity-60');
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['v2', 'v3', 'v1']);

    await act(async () => pending.resolve(jsonResponse()));
    expect(container.querySelector('ul')).not.toHaveClass('opacity-60');
  });

  it('rolls back failed writes and reports HTTP plus network errors', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'server failed' }, 500))
      .mockRejectedValueOnce(new Error('network failed'));
    renderWithProviders(<ListReorderGrid listId={7} items={[item('v1'), item('v2')]} {...props} />, { locale: 'en' });
    drag('v1', 'v2');
    expect(await screen.findByText('Could not reorder: server failed')).toBeInTheDocument();
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['v1', 'v2']);

    drag('v1', 'v2');
    expect(await screen.findByText('Could not reorder: network failed')).toBeInTheDocument();
  });

  it('aborts obsolete writes when list props change or the grid unmounts', async () => {
    const first = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(first.promise);
    const rendered = renderWithProviders(<ListReorderGrid listId={7} items={[item('v1'), item('v2')]} {...props} />, { locale: 'en' });
    drag('v1', 'v2');
    const firstSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    rendered.rerender(<ListReorderGrid listId={8} items={[item('v3')]} {...props} />);
    expect(firstSignal?.aborted).toBe(true);
    expect(screen.getByRole('link', { name: 'v3' })).toBeInTheDocument();
    await act(async () => first.reject(new Error('late failure')));
    expect(screen.queryByText(/late failure/)).not.toBeInTheDocument();

    const second = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(second.promise);
    rendered.rerender(<ListReorderGrid listId={8} items={[item('v3'), item('v4')]} {...props} />);
    drag('v3', 'v4');
    const secondSignal = vi.mocked(fetch).mock.calls[1]?.[1]?.signal;
    rendered.unmount();
    expect(secondSignal?.aborted).toBe(true);
    await act(async () => second.resolve(jsonResponse()));
  });
});

describe('StubCard', () => {
  it('links directly to the missing VN card target', () => {
    renderWithProviders(<StubCard vnId="v9" />, { locale: 'en' });
    expect(screen.getByRole('link', { name: 'v9' })).toHaveAttribute('href', '/vn/v9');
  });
});
