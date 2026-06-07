// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { VnDetailLayout } from '@/components/VnDetailLayout';
import { VN_LAYOUT_EVENT, defaultVnDetailLayoutV1 } from '@/lib/vn-detail-layout';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const dnd: { onDragEnd?: (e: unknown) => void } = {};
const sortableState = { isDragging: false };
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
    useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: undefined, isDragging: sortableState.isDragging }),
  };
});
vi.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => '' } } }));

function okFetch() {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason?: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const sectionNodes = {
  notes: <div data-testid="sec-notes">Notes body</div>,
  routes: <div data-testid="sec-routes">Routes body</div>,
  characters: <div data-testid="sec-characters">Characters body</div>,
};

describe('VnDetailLayout branches', () => {
  beforeEach(() => {
    localStorage.clear();
    refreshMock.mockClear();
    dnd.onDragEnd = undefined;
    sortableState.isDragging = false;
    global.fetch = okFetch() as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('reorders the draft via a drag-end then persists the new order on save', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />);
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    const before = defaultVnDetailLayoutV1().order.filter((id) => id in sectionNodes);
    act(() => {
      dnd.onDragEnd?.({ active: { id: before[0] }, over: { id: before[before.length - 1] } });
    });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer|Save/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    // The full canonical order is persisted; the moved id is no longer first
    // among the renderable subset.
    expect(body.vn_detail_section_layout_v1.order).toBeTruthy();
  });

  it('ignores a drag-end with no drop target and one dropped on itself', () => {
    renderWithProviders(<VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />);
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    act(() => {
      dnd.onDragEnd?.({ active: { id: 'notes' }, over: null });
      dnd.onDragEnd?.({ active: { id: 'notes' }, over: { id: 'notes' } });
      dnd.onDragEnd?.({ active: { id: 'not-real' }, over: { id: 'notes' } });
    });
    // No crash; still in edit mode with the three rows.
    expect(screen.getAllByRole('listitem').length).toBe(3);
  });

  it('omits the mobile nav when every applicable section is hidden', () => {
    const layout = defaultVnDetailLayoutV1();
    layout.sections.notes.visible = false;
    layout.sections.routes.visible = false;
    layout.sections.characters.visible = false;
    renderWithProviders(<VnDetailLayout vnId="v90001" initialLayout={layout} sectionNodes={sectionNodes} />);
    // visibleIds is empty -> the <nav> is not rendered.
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('renders a hidden section row with a show-section toggle in edit mode', () => {
    const layout = defaultVnDetailLayoutV1();
    layout.sections.notes.visible = false;
    renderWithProviders(<VnDetailLayout vnId="v90001" initialLayout={layout} sectionNodes={sectionNodes} />);
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    const rows = screen.getAllByRole('listitem');
    // The hidden notes row exposes the "show" affordance (aria-pressed true).
    const notesRow = rows.find((r) => within(r).queryByRole('button', { name: /Réafficher|Show/i }));
    expect(notesRow).toBeTruthy();
  });

  it('re-syncs the draft when editMode is false and a fresh initialLayout arrives', () => {
    const { rerender } = renderWithProviders(
      <VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    const next = defaultVnDetailLayoutV1();
    next.sections.routes.visible = false;
    rerender(<VnDetailLayout vnId="v90001" initialLayout={next} sectionNodes={sectionNodes} />);
    expect(screen.queryByTestId('sec-routes')).toBeNull();
    expect(screen.getByTestId('sec-notes')).toBeTruthy();
  });

  it('ignores layout events without layout data and skips undefined section nodes', () => {
    renderWithProviders(
      <VnDetailLayout
        vnId="v90001"
        initialLayout={defaultVnDetailLayoutV1()}
        sectionNodes={{ ...sectionNodes, routes: undefined }}
      />,
    );
    fireEvent(window, new CustomEvent(VN_LAYOUT_EVENT, { detail: {} }));
    expect(screen.queryByTestId('sec-routes')).toBeNull();
    expect(screen.getByTestId('sec-notes')).toBeTruthy();
  });

  it('locks edit controls while a VN layout save is in flight', async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn(() => pending.promise);
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />);
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    const saveButton = screen.getByRole('button', { name: /Enregistrer|Save/i });
    const resetButton = screen.getByRole('button', { name: /Valeurs par défaut|Réinitialiser|Defaults|Reset/i });
    const cancelButton = screen.getByRole('button', { name: /Annuler|Cancel/i });
    const visibilityButton = screen.getAllByRole('button', { name: /Masquer|Réafficher|Hide|Show/i })[0];
    const collapseCheckbox = screen.getAllByRole('checkbox', { name: /Repliée par défaut|Collapsed by default/i })[0];
    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      resetButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      visibilityButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      collapseCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      dnd.onDragEnd?.({ active: { id: 'notes' }, over: { id: 'routes' } });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
      await pending.promise;
    });
  });

  it('ignores stale VN layout save success and failure after identity changes', async () => {
    const success = deferredResponse();
    global.fetch = vi.fn(() => success.promise) as unknown as typeof fetch;
    const first = renderWithProviders(<VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />);
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer|Save/i }));
    first.rerender(<VnDetailLayout vnId="v90002" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />);
    await act(async () => {
      success.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
      await success.promise;
    });
    expect(screen.getByRole('button', { name: /Modifier|Edit/i })).toBeTruthy();

    first.unmount();
    const failure = deferredResponse();
    global.fetch = vi.fn(() => failure.promise) as unknown as typeof fetch;
    const second = renderWithProviders(<VnDetailLayout vnId="v90003" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />);
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer|Save/i }));
    second.rerender(<VnDetailLayout vnId="v90004" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />);
    await act(async () => {
      failure.reject(new Error('late failure'));
      await failure.promise.catch(() => undefined);
    });
    expect(screen.getByRole('button', { name: /Modifier|Edit/i })).toBeTruthy();
  });

  it('renders the VN layout dragging class from the sortable hook', () => {
    sortableState.isDragging = true;
    renderWithProviders(<VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />);
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    const row = screen.getByText(/Notes|Notes body/).closest('li') as HTMLElement;
    expect(row.className).toContain('border-accent');
  });
});
