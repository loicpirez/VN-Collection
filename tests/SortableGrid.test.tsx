// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import type { CollectionCardApiItem } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/**
 * Capture the DndContext drag handlers so the tests can invoke the
 * reorder logic directly: a real pointer drag is not performable in
 * jsdom, but the component's `onDragStart` / `onDragEnd` are plain
 * functions we can drive with synthetic events.
 */
const dndHandlers: {
  onDragStart?: (e: unknown) => void;
  onDragEnd?: (e: unknown) => void;
  onDragCancel?: (e: unknown) => void;
} = {};

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragStart, onDragEnd, onDragCancel }: {
    children: React.ReactNode;
    onDragStart?: (e: unknown) => void;
    onDragEnd?: (e: unknown) => void;
    onDragCancel?: (e: unknown) => void;
  }) => {
    dndHandlers.onDragStart = onDragStart;
    dndHandlers.onDragEnd = onDragEnd;
    dndHandlers.onDragCancel = onDragCancel;
    return <div data-testid="dnd-context">{children}</div>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
  PointerSensor: function PointerSensor() {},
  KeyboardSensor: function KeyboardSensor() {},
  TouchSensor: function TouchSensor() {},
  closestCenter: () => [],
  useSensor: (s: unknown) => s,
  useSensors: (...s: unknown[]) => s,
}));

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable');
  return {
    arrayMove: actual.arrayMove,
    SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    rectSortingStrategy: () => null,
    verticalListSortingStrategy: () => null,
    sortableKeyboardCoordinates: () => null,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  };
});

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

vi.mock('@/components/VnCard', () => ({
  VnCard: ({ data }: { data: { id: string; title: string } }) => (
    <div data-testid="vncard" data-id={data.id}>{data.title}</div>
  ),
}));

import { SortableGrid } from '@/components/SortableGrid';

/** Minimal card row that `toCardData` can project without extra fields. */
function card(id: string, title: string): CollectionCardApiItem {
  return {
    id,
    title,
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    released: null,
    length_minutes: null,
    rating: null,
    developers: [],
    publishers: [],
    tags: [],
    relations: [],
    local_image: null,
    local_image_thumb: null,
    custom_cover: null,
    banner_image: null,
    banner_position: null,
    cover_rotation: 0,
    banner_rotation: 0,
    fetched_at: 0,
    has_notes: false,
    list_count: 0,
    in_reading_queue: false,
  } as CollectionCardApiItem;
}

beforeEach(() => {
  dndHandlers.onDragStart = undefined;
  dndHandlers.onDragEnd = undefined;
  dndHandlers.onDragCancel = undefined;
});

afterEach(() => {
  cleanup();
});

describe('SortableGrid', () => {
  it('renders a card per item plus the keyboard reorder hint', () => {
    renderWithProviders(
      <SortableGrid
        items={[card('v90001', 'Title A'), card('v90002', 'Title B')]}
        onReorder={vi.fn()}
      />,
      { locale: 'en' },
    );
    const cards = screen.getAllByTestId('vncard');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Title A');
    expect(screen.getByText(/Tab to focus a card/)).toBeInTheDocument();
  });

  it('invokes onReorder with the reordered ids after a drag-end across two items', () => {
    const onReorder = vi.fn();
    renderWithProviders(
      <SortableGrid
        items={[card('v90001', 'A'), card('v90002', 'B'), card('v90003', 'C')]}
        onReorder={onReorder}
      />,
      { locale: 'en' },
    );
    act(() => {
      dndHandlers.onDragStart?.({ active: { id: 'v90001' } });
      dndHandlers.onDragEnd?.({ active: { id: 'v90001' }, over: { id: 'v90003' } });
    });
    expect(onReorder).toHaveBeenCalledWith(['v90002', 'v90003', 'v90001']);
  });

  it('does not call onReorder when dropped on itself', () => {
    const onReorder = vi.fn();
    renderWithProviders(
      <SortableGrid items={[card('v90001', 'A'), card('v90002', 'B')]} onReorder={onReorder} />,
      { locale: 'en' },
    );
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: 'v90001' }, over: { id: 'v90001' } });
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('does not call onReorder when there is no drop target', () => {
    const onReorder = vi.fn();
    renderWithProviders(
      <SortableGrid items={[card('v90001', 'A'), card('v90002', 'B')]} onReorder={onReorder} />,
      { locale: 'en' },
    );
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: 'v90001' }, over: null });
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('ignores drag callbacks entirely when disabled', () => {
    const onReorder = vi.fn();
    renderWithProviders(
      <SortableGrid items={[card('v90001', 'A'), card('v90002', 'B')]} onReorder={onReorder} disabled />,
      { locale: 'en' },
    );
    act(() => {
      dndHandlers.onDragStart?.({ active: { id: 'v90001' } });
      dndHandlers.onDragEnd?.({ active: { id: 'v90001' }, over: { id: 'v90002' } });
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('renders the dragged card in the overlay after drag-start and clears it on cancel', () => {
    renderWithProviders(
      <SortableGrid items={[card('v90001', 'Overlay Title'), card('v90002', 'B')]} onReorder={vi.fn()} />,
      { locale: 'en' },
    );
    act(() => {
      dndHandlers.onDragStart?.({ active: { id: 'v90001' } });
    });
    const overlay = screen.getByTestId('drag-overlay');
    expect(overlay).toHaveTextContent('Overlay Title');
    act(() => {
      dndHandlers.onDragCancel?.({});
    });
    expect(screen.getByTestId('drag-overlay')).toBeEmptyDOMElement();
  });

  it('applies the dense grid template multiplier', () => {
    const { container } = renderWithProviders(
      <SortableGrid items={[card('v90001', 'A')]} onReorder={vi.fn()} dense />,
      { locale: 'en' },
    );
    const grid = container.querySelector('.grid') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toContain('* 0.72');
  });
});
