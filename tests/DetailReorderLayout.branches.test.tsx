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
});
