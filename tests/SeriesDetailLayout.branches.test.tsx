// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { SeriesDetailLayout } from '@/components/SeriesDetailLayout';
import { defaultSeriesDetailLayoutV1 } from '@/lib/series-detail-layout';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const dnd: { onDragEnd?: (e: unknown) => void } = {};
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd?: (e: unknown) => void }) => {
    dnd.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
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
    verticalListSortingStrategy: () => null,
    sortableKeyboardCoordinates: () => null,
    useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: undefined, isDragging: false }),
  };
});
vi.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => '' } } }));

function okFetch() {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

const sectionNodes = {
  hero: <div data-testid="sec-hero">Hero body</div>,
  works: <div data-testid="sec-works">Works body</div>,
  stats: <div data-testid="sec-stats">Stats body</div>,
};

describe('SeriesDetailLayout branches', () => {
  beforeEach(() => {
    refreshMock.mockClear();
    dnd.onDragEnd = undefined;
    global.fetch = okFetch() as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reorders the draft via a drag-end and persists the order on save', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={defaultSeriesDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    act(() => {
      dnd.onDragEnd?.({ active: { id: 'hero' }, over: { id: 'stats' } });
    });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer|Save/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.series_detail_section_layout_v1.order[0]).not.toBe('hero');
  });

  it('ignores drag-ends with no target, self-drop, or an unknown active id', () => {
    renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={defaultSeriesDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    act(() => {
      dnd.onDragEnd?.({ active: { id: 'hero' }, over: null });
      dnd.onDragEnd?.({ active: { id: 'hero' }, over: { id: 'hero' } });
      dnd.onDragEnd?.({ active: { id: 'not-real' }, over: { id: 'hero' } });
    });
    expect(screen.getAllByRole('listitem').length).toBe(3);
  });

  it('expands then collapses a collapsed-by-default section in normal mode', () => {
    const layout = defaultSeriesDetailLayoutV1();
    layout.sections.stats.collapsedByDefault = true;
    renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={layout} sectionNodes={sectionNodes} />,
    );
    expect(screen.queryByTestId('sec-stats')).toBeNull();
    const header = screen.getByRole('button', { name: /Statistiques|Statistics/i });
    fireEvent.click(header);
    expect(screen.getByTestId('sec-stats')).toBeTruthy();
    // Click again to collapse (toggles the open state false).
    fireEvent.click(header);
    expect(screen.queryByTestId('sec-stats')).toBeNull();
  });

  it('renders a hidden-section row with the show affordance in edit mode', () => {
    const layout = defaultSeriesDetailLayoutV1();
    layout.sections.works.visible = false;
    renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={layout} sectionNodes={sectionNodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    const rows = screen.getAllByRole('listitem');
    // The hidden works row's visibility button carries aria-pressed=true.
    const hiddenRow = rows.find((r) => {
      const btn = within(r).queryByRole('button', { name: 'Works' })
        ?? within(r).getAllByRole('button').find((b) => b.getAttribute('aria-pressed') === 'true');
      return btn?.getAttribute('aria-pressed') === 'true';
    });
    expect(hiddenRow).toBeTruthy();
  });

  it('re-syncs the draft when not editing and a fresh initialLayout arrives', () => {
    const { rerender } = renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={defaultSeriesDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    const next = defaultSeriesDetailLayoutV1();
    next.sections.works.visible = false;
    rerender(<SeriesDetailLayout seriesId={5} initialLayout={next} sectionNodes={sectionNodes} />);
    expect(screen.queryByTestId('sec-works')).toBeNull();
    expect(screen.getByTestId('sec-hero')).toBeTruthy();
  });
});
