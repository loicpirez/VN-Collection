// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DetailReorderLayout, type SectionLayoutV1 } from '@/components/DetailReorderLayout';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
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

const SECTION_IDS = ['overview', 'works', 'extra'] as const;
const EVENT_NAME = 'character:detail-layout-changed';
const SETTINGS_KEY = 'character_detail_section_layout_v1';

function makeLayout(overrides?: Partial<SectionLayoutV1>): SectionLayoutV1 {
  const base: SectionLayoutV1 = {
    sections: { overview: { visible: true }, works: { visible: true }, extra: { visible: true } },
    order: ['overview', 'works', 'extra'],
  };
  return { ...base, ...overrides };
}

function sections() {
  return [
    { id: 'overview', node: <div data-testid="sec-overview">Overview body</div>, label: 'Overview' },
    { id: 'works', node: <div data-testid="sec-works">Works body</div>, label: 'Works' },
    { id: 'extra', node: <div data-testid="sec-extra">Extra body</div> },
  ];
}

function renderLayout(layout = makeLayout(), identityKey = 'p90001') {
  return renderWithProviders(
    <DetailReorderLayout
      sections={sections()}
      initialLayout={layout}
      sectionIds={SECTION_IDS}
      settingsKey={SETTINGS_KEY}
      eventName={EVENT_NAME}
      identityKey={identityKey}
    />,
  );
}

describe('DetailReorderLayout branches', () => {
  beforeEach(() => {
    dnd.onDragEnd = undefined;
    sortableState.isDragging = false;
    global.fetch = okFetch() as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reorders the draft order via a drag-end and persists the new order on save', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Edit layout|Mise en page/i }));
    act(() => {
      dnd.onDragEnd?.({ active: { id: 'overview' }, over: { id: 'extra' } });
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$|Enregistrer/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body[SETTINGS_KEY].order[0]).not.toBe('overview');
  });

  it('ignores a drag-end dropped on itself (order unchanged)', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Edit layout|Mise en page/i }));
    act(() => {
      dnd.onDragEnd?.({ active: { id: 'works' }, over: { id: 'works' } });
    });
    // Still in edit mode, rows intact.
    expect(screen.getAllByRole('button', { name: /Drag|Déplacer/i }).length).toBe(3);
  });

  it('cancel discards a reorder and returns to normal mode', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Edit layout|Mise en page/i }));
    act(() => {
      dnd.onDragEnd?.({ active: { id: 'overview' }, over: { id: 'extra' } });
    });
    fireEvent.click(screen.getByRole('button', { name: /Cancel|Annuler/i }));
    // Back to normal mode (the Edit layout chip is shown again).
    expect(screen.getByRole('button', { name: /Edit layout|Mise en page/i })).toBeTruthy();
    expect(screen.getByTestId('sec-overview')).toBeTruthy();
  });

  it('appends a section that is missing from the layout order', () => {
    // `order` omits "extra"; the component still renders it (appended loop).
    const layout: SectionLayoutV1 = {
      sections: { overview: { visible: true }, works: { visible: true }, extra: { visible: true } },
      order: ['overview', 'works'],
    };
    renderLayout(layout);
    expect(screen.getByTestId('sec-extra')).toBeTruthy();
  });

  it('shows a collapsed-by-default section behind a collapsible header in edit mode and toggles it', () => {
    const layout = makeLayout();
    layout.sections.overview.collapsedByDefault = true;
    renderLayout(layout);
    // Enter edit mode: a labelled section gets a collapse toggle reflecting its state.
    fireEvent.click(screen.getByRole('button', { name: /Edit layout|Mise en page/i }));
    const collapseToggles = screen.getAllByRole('button', { name: /Collapse|Expand|Réduire par défaut|Agrandir par défaut/i });
    expect(collapseToggles.length).toBe(2);
    // The overview row starts collapsed -> clicking flips it back to expanded.
    fireEvent.click(collapseToggles[0]);
    // Still in edit mode after toggling.
    expect(screen.getByRole('button', { name: /^Save$|Enregistrer/i })).toBeTruthy();
  });

  it('renders a hidden section greyed out in edit mode (show label available)', () => {
    const layout = makeLayout();
    layout.sections.works.visible = false;
    renderLayout(layout);
    fireEvent.click(screen.getByRole('button', { name: /Edit layout|Mise en page/i }));
    // The hidden section's toggle exposes the "Show section" affordance.
    expect(screen.getAllByRole('button', { name: /Show section|Afficher la section/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('resets the abort state and returns to normal mode when identityKey changes mid-edit', () => {
    const { rerender } = renderLayout(makeLayout(), 'p90001');
    fireEvent.click(screen.getByRole('button', { name: /Edit layout|Mise en page/i }));
    expect(screen.getByRole('button', { name: /^Save$|Enregistrer/i })).toBeTruthy();
    rerender(
      <DetailReorderLayout
        sections={sections()}
        initialLayout={makeLayout()}
        sectionIds={SECTION_IDS}
        settingsKey={SETTINGS_KEY}
        eventName={EVENT_NAME}
        identityKey="p90002"
      />,
    );
    // The identity effect forces editing=false.
    expect(screen.queryByRole('button', { name: /^Save$|Enregistrer/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Edit layout|Mise en page/i })).toBeTruthy();
  });

  it('ignores layout events without a layout payload', () => {
    renderLayout();
    fireEvent(window, new CustomEvent(EVENT_NAME, { detail: {} }));
    expect(screen.getByTestId('sec-extra')).toBeTruthy();
  });

  it('skips unknown ordered ids and falls back to visible state for missing section entries', () => {
    const layout = {
      sections: { overview: { visible: true } },
      order: ['ghost', 'works'],
    } as unknown as SectionLayoutV1;
    renderLayout(layout);
    expect(screen.getByTestId('sec-works')).toBeTruthy();
    expect(screen.getByTestId('sec-overview')).toBeTruthy();
    expect(screen.getByTestId('sec-extra')).toBeTruthy();
  });

  it('toggles visibility for a section missing from the persisted section map', () => {
    const layout = {
      sections: { overview: { visible: true } },
      order: ['works', 'overview', 'extra'],
    } as unknown as SectionLayoutV1;
    renderLayout(layout);
    fireEvent.click(screen.getByRole('button', { name: /Edit layout|Mise en page/i }));
    const worksRow = screen.getByText('Works').closest('.relative') as HTMLElement;
    fireEvent.click(within(worksRow).getByRole('button', { name: /Hide section|Masquer la section/i }));
    expect(screen.getByRole('button', { name: /^Save$|Enregistrer/i })).toBeTruthy();
  });

  it('ignores drag events whose ids are missing from the draft order', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Edit layout|Mise en page/i }));
    act(() => {
      dnd.onDragEnd?.({ active: { id: 'missing' }, over: { id: 'works' } });
    });
    expect(screen.getAllByRole('button', { name: /Drag|Déplacer/i }).length).toBe(3);
  });

  it('locks edit controls while a save is in flight', async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn(() => pending.promise);
    global.fetch = fetchMock as unknown as typeof fetch;
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Edit layout|Mise en page/i }));
    const saveButton = screen.getByRole('button', { name: /^Save$|Enregistrer/i });
    const resetButton = screen.getByRole('button', { name: /Reset|Réinitialiser/i });
    const cancelButton = screen.getByRole('button', { name: /Cancel|Annuler/i });
    const hideButton = screen.getAllByRole('button', { name: /Hide section|Masquer la section|Show section|Afficher la section/i })[0];
    const collapseButton = screen.getAllByRole('button', { name: /Collapse|Expand|Réduire par défaut|Agrandir par défaut/i })[0];
    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      resetButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      hideButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      collapseButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      dnd.onDragEnd?.({ active: { id: 'overview' }, over: { id: 'works' } });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
      await pending.promise;
    });
  });

  it('ignores stale save success and failure after identity changes', async () => {
    const success = deferredResponse();
    global.fetch = vi.fn(() => success.promise) as unknown as typeof fetch;
    const first = renderLayout(makeLayout(), 'p90001');
    fireEvent.click(screen.getByRole('button', { name: /Edit layout|Mise en page/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$|Enregistrer/i }));
    first.rerender(
      <DetailReorderLayout
        sections={sections()}
        initialLayout={makeLayout()}
        sectionIds={SECTION_IDS}
        settingsKey={SETTINGS_KEY}
        eventName={EVENT_NAME}
        identityKey="p90002"
      />,
    );
    await act(async () => {
      success.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
      await success.promise;
    });
    expect(screen.getByRole('button', { name: /Edit layout|Mise en page/i })).toBeTruthy();

    first.unmount();
    const failure = deferredResponse();
    global.fetch = vi.fn(() => failure.promise) as unknown as typeof fetch;
    const second = renderLayout(makeLayout(), 'p90003');
    fireEvent.click(screen.getByRole('button', { name: /Edit layout|Mise en page/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$|Enregistrer/i }));
    second.rerender(
      <DetailReorderLayout
        sections={sections()}
        initialLayout={makeLayout()}
        sectionIds={SECTION_IDS}
        settingsKey={SETTINGS_KEY}
        eventName={EVENT_NAME}
        identityKey="p90004"
      />,
    );
    await act(async () => {
      failure.reject(new Error('late failure'));
      await failure.promise.catch(() => undefined);
    });
    expect(screen.getByRole('button', { name: /Edit layout|Mise en page/i })).toBeTruthy();
  });

  it('renders the dragging style from the sortable hook', () => {
    sortableState.isDragging = true;
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Edit layout|Mise en page/i }));
    const row = screen.getByText('Overview').closest('.relative') as HTMLElement;
    expect(row.style.opacity).toBe('0.5');
  });
});
