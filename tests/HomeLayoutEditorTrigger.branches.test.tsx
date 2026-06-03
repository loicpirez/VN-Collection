// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor, act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { HomeLayoutEditorTrigger, HOME_LAYOUT_OPEN_EVENT } from '@/components/HomeLayoutEditorTrigger';
import { DEFAULT_HOME_LAYOUT } from '@/lib/home-section-layout';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** Capture the SortableContext drag-end handler so jsdom can drive a reorder. */
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

function openDialog() {
  act(() => {
    window.dispatchEvent(new CustomEvent(HOME_LAYOUT_OPEN_EVENT));
  });
}

describe('HomeLayoutEditorTrigger branches', () => {
  beforeEach(() => {
    refreshMock.mockClear();
    dnd.onDragEnd = undefined;
    global.fetch = okFetch() as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists the reordered ids when a drag-end moves a row', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<HomeLayoutEditorTrigger layout={DEFAULT_HOME_LAYOUT} />);
    openDialog();
    act(() => {
      dnd.onDragEnd?.({ active: { id: 'recently-viewed' }, over: { id: 'anniversary' } });
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.home_section_layout_v1.order[0]).not.toBe('recently-viewed');
  });

  it('ignores a drag-end dropped on itself (no PATCH)', () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<HomeLayoutEditorTrigger layout={DEFAULT_HOME_LAYOUT} />);
    openDialog();
    act(() => {
      dnd.onDragEnd?.({ active: { id: 'anniversary' }, over: { id: 'anniversary' } });
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a drag-end whose active id is not in the order (oldIndex < 0)', () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<HomeLayoutEditorTrigger layout={DEFAULT_HOME_LAYOUT} />);
    openDialog();
    act(() => {
      dnd.onDragEnd?.({ active: { id: 'not-a-section' }, over: { id: 'anniversary' } });
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not close on backdrop click while a mutation is in flight', async () => {
    // Hang the PATCH so inFlightRef stays true while we click the backdrop.
    let release: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((res) => { release = res; })) as unknown as typeof fetch;
    renderWithProviders(<HomeLayoutEditorTrigger layout={DEFAULT_HOME_LAYOUT} />);
    openDialog();
    const dialog = screen.getByRole('dialog');
    const rows = within(dialog).getAllByRole('listitem');
    fireEvent.click(within(rows[0]).getByRole('button', { name: /Hide section|Masquer la section/i }));
    // The toggle's PATCH is pending -> backdrop click is a no-op.
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The close (X) button is disabled while busy and also guarded.
    fireEvent.click(within(dialog).getByRole('button', { name: /Close|Fermer/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      release(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });
  });

  it('a second toggle is a no-op while the first PATCH is still pending', async () => {
    let release: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((res) => { release = res; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<HomeLayoutEditorTrigger layout={DEFAULT_HOME_LAYOUT} />);
    openDialog();
    const dialog = screen.getByRole('dialog');
    const rows = within(dialog).getAllByRole('listitem');
    fireEvent.click(within(rows[0]).getByRole('button', { name: /Hide section|Masquer la section/i }));
    fireEvent.click(within(rows[1]).getByRole('button', { name: /Hide section|Masquer la section/i }));
    // Only the first toggle issued a PATCH; the inFlightRef guard blocks the second.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      release(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });
  });
});
