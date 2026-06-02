// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingQueueStripView, type ReadingQueueEntry } from '@/components/ReadingQueueStripView';
import type { HomeSectionState } from '@/lib/home-section-layout';
import { renderWithProviders } from './helpers/render-component';

interface DragEventStub {
  active: { id: string };
  over: { id: string } | null;
}

const dndMocks = vi.hoisted(() => ({
  onDragEnd: null as ((event: DragEventStub) => void) | null,
  isDragging: false,
}));

const sectionMocks = vi.hoisted(() => ({
  state: {
    state: { visible: true, collapsed: false },
    busy: false,
    isHidden: false,
    isCollapsed: false,
    toggleCollapsed: vi.fn(),
    hide: vi.fn(),
  },
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (event: DragEventStub) => void }) => {
    dndMocks.onDragEnd = onDragEnd;
    return <div data-testid="dnd-context">{children}</div>;
  },
  KeyboardSensor: function KeyboardSensor() {},
  PointerSensor: function PointerSensor() {},
  TouchSensor: function TouchSensor() {},
  closestCenter: vi.fn(),
  useSensor: (...args: unknown[]) => args,
  useSensors: (...args: unknown[]) => args,
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  arrayMove: <T,>(values: T[], from: number, to: number): T[] => {
    const next = [...values];
    next.splice(to, 0, ...next.splice(from, 1));
    return next;
  },
  rectSortingStrategy: {},
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: ({ id }: { id: string }) => ({
    attributes: { 'data-sort-id': id },
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: dndMocks.isDragging,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, localSrc, alt }: { src: string | null; localSrc: string | null; alt: string }) => (
    <img src={src ?? undefined} data-local-src={localSrc ?? undefined} alt={alt} />
  ),
}));

vi.mock('@/components/HomeSectionMenu', () => ({
  useHomeSection: () => sectionMocks.state,
  HomeSectionControls: ({
    onCollapseToggle,
    onHide,
    sectionLabel,
  }: {
    state: HomeSectionState;
    busy: boolean;
    onCollapseToggle: () => void;
    onHide: () => void;
    sectionLabel: string;
  }) => (
    <div aria-label={sectionLabel}>
      <button type="button" onClick={onCollapseToggle}>collapse</button>
      <button type="button" onClick={onHide}>hide</button>
    </div>
  ),
}));

vi.mock('@/components/ToastProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ToastProvider')>();
  return {
    ...actual,
    useToast: () => toastMocks,
  };
});

function entry(overrides: Partial<ReadingQueueEntry> = {}): ReadingQueueEntry {
  return {
    position: 1,
    vn_id: 'v1',
    title: 'First VN',
    image_url: 'https://example.com/first.jpg',
    image_thumb: null,
    local_image_thumb: null,
    image_sexual: null,
    predictedMinutes: null,
    ...overrides,
  };
}

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

function renderQueue(entries: ReadingQueueEntry[] = [entry()]) {
  return renderWithProviders(
    <ReadingQueueStripView
      title="Reading queue"
      entries={entries}
      locale="en"
      units={{ hoursUnit: 'h', minutesUnit: 'm' }}
      reorderHint="Drag to reorder"
      reorderKeyboardHint="Use arrow keys to reorder"
      youLabel="You"
      errorLabel="Error"
    />,
    { locale: 'en' },
  );
}

function drag(active: string, over: string | null) {
  act(() => dndMocks.onDragEnd?.({ active: { id: active }, over: over == null ? null : { id: over } }));
}

beforeEach(() => {
  dndMocks.onDragEnd = null;
  dndMocks.isDragging = false;
  sectionMocks.state.state = { visible: true, collapsed: false };
  sectionMocks.state.busy = false;
  sectionMocks.state.isHidden = false;
  sectionMocks.state.isCollapsed = false;
  sectionMocks.state.toggleCollapsed.mockReset();
  sectionMocks.state.hide.mockReset();
  toastMocks.error.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ReadingQueueStripView', () => {
  it('renders nothing when the section is hidden', () => {
    sectionMocks.state.isHidden = true;
    const { container } = renderQueue();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the collapsed header and delegates its section controls', () => {
    sectionMocks.state.isCollapsed = true;
    renderQueue([entry(), entry({ vn_id: 'v2', title: 'Second VN' })]);
    expect(screen.getByText('/ 2')).toBeInTheDocument();
    expect(screen.queryByTestId('dnd-context')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'collapse' }));
    fireEvent.click(screen.getByRole('button', { name: 'hide' }));
    expect(sectionMocks.state.toggleCollapsed).toHaveBeenCalledTimes(1);
    expect(sectionMocks.state.hide).toHaveBeenCalledTimes(1);
  });

  it('renders image fallback, local artwork, predicted time, drag styling, and prop updates', () => {
    dndMocks.isDragging = true;
    const first = entry({
      image_url: null,
      image_thumb: 'https://example.com/thumb.jpg',
      local_image_thumb: '/local/thumb.jpg',
      predictedMinutes: 95,
    });
    const { rerender } = renderQueue([first]);
    expect(screen.getByText('You ≈ 1h 35m')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'First VN' })).toHaveAttribute('src', 'https://example.com/thumb.jpg');
    expect(screen.getByRole('img', { name: 'First VN' })).toHaveAttribute('data-local-src', '/local/thumb.jpg');
    const item = screen.getByRole('listitem');
    expect(item).toHaveClass('opacity-40');
    expect(item).toHaveClass('cursor-grab');
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
    item.dispatchEvent(dragStart);
    expect(dragStart.defaultPrevented).toBe(true);

    dndMocks.isDragging = false;
    rerender(
      <ReadingQueueStripView
        title="Reading queue"
        entries={[entry({ vn_id: 'v2', title: 'Second VN' })]}
        locale="en"
        units={{ hoursUnit: 'h', minutesUnit: 'm' }}
        reorderHint="Drag to reorder"
        reorderKeyboardHint="Use arrow keys to reorder"
        youLabel="You"
        errorLabel="Error"
      />,
    );
    expect(screen.getByRole('link', { name: /Second VN/ })).toHaveAttribute('href', '/vn/v2');
    expect(screen.queryByText(/You/)).not.toBeInTheDocument();
  });

  it('ignores drops that cannot change the ordering', () => {
    renderQueue([entry(), entry({ vn_id: 'v2', title: 'Second VN' })]);
    drag('v1', null);
    drag('v1', 'v1');
    drag('missing', 'v2');
    drag('v1', 'missing');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('optimistically reorders, disables chips while saving, persists ids, and suppresses a duplicate drop', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    renderQueue([entry(), entry({ vn_id: 'v2', title: 'Second VN' })]);
    drag('v1', 'v2');
    drag('v2', 'v1');

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/vn/v2', '/vn/v1']);
    expect(list).toHaveClass('opacity-60');
    expect(within(list).getAllByRole('listitem')[0]).toHaveClass('cursor-not-allowed');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/reading-queue', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ ids: ['v2', 'v1'] }),
    }));

    await act(async () => mutation.resolve(jsonResponse()));
    await waitFor(() => expect(list).not.toHaveClass('opacity-60'));
  });

  it('rolls back and reports HTTP and network persistence failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'save failed' }, 500))
      .mockRejectedValueOnce(new Error('network failed'));
    renderQueue([entry(), entry({ vn_id: 'v2', title: 'Second VN' })]);
    drag('v1', 'v2');
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('Error: save failed'));
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/vn/v1', '/vn/v2']);

    drag('v1', 'v2');
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('Error: network failed'));
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/vn/v1', '/vn/v2']);
  });

  it('aborts an in-flight persistence request during teardown without reporting it', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    const mounted = renderQueue([entry(), entry({ vn_id: 'v2', title: 'Second VN' })]);
    drag('v1', 'v2');
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(request?.signal?.aborted).toBe(false);
    mounted.unmount();
    expect(request?.signal?.aborted).toBe(true);
    await act(async () => mutation.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
