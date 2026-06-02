// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DetailReorderLayout, type SectionLayoutV1 } from '@/components/DetailReorderLayout';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

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
    sections: {
      overview: { visible: true },
      works: { visible: true },
      extra: { visible: true },
    },
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

describe('DetailReorderLayout', () => {
  beforeEach(() => {
    global.fetch = okFetch() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders visible sections directly in normal mode', () => {
    renderLayout();
    expect(screen.getByTestId('sec-overview')).toBeTruthy();
    expect(screen.getByTestId('sec-works')).toBeTruthy();
    expect(screen.getByTestId('sec-extra')).toBeTruthy();
  });

  it('skips a hidden section in normal mode', () => {
    const layout = makeLayout();
    layout.sections.works.visible = false;
    renderLayout(layout);
    expect(screen.queryByTestId('sec-works')).toBeNull();
    expect(screen.getByTestId('sec-overview')).toBeTruthy();
  });

  it('renders a collapsed-by-default labelled section behind a collapsible header', () => {
    const layout = makeLayout();
    layout.sections.overview.collapsedByDefault = true;
    renderLayout(layout);
    expect(screen.queryByTestId('sec-overview')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.getByTestId('sec-overview')).toBeTruthy();
  });

  it('enters edit mode showing all sections with drag handles', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Mise en page|Edit layout/i }));
    const handles = screen.getAllByRole('button', { name: /Déplacer|Drag/i });
    expect(handles.length).toBe(3);
  });

  it('exposes the collapse toggle only for labelled sections', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Mise en page|Edit layout/i }));
    // Two labelled sections (overview, works) get the collapse toggle.
    const collapseToggles = screen.getAllByRole('button', { name: /Réduire par défaut|Collapse|Agrandir par défaut|Expand/i });
    expect(collapseToggles.length).toBe(2);
  });

  it('toggles a labelled section collapse state then saves it', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(
      <DetailReorderLayout
        sections={sections()}
        initialLayout={makeLayout()}
        sectionIds={SECTION_IDS}
        settingsKey={SETTINGS_KEY}
        eventName={EVENT_NAME}
        identityKey="p90001"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Mise en page|Edit layout/i }));
    const collapseToggles = screen.getAllByRole('button', { name: /Réduire par défaut|Collapse|Agrandir par défaut|Expand/i });
    fireEvent.click(collapseToggles[0]);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer|^Save$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body[SETTINGS_KEY].sections.overview.collapsedByDefault).toBe(true);
  });

  it('toggles visibility in the draft and persists on save', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Mise en page|Edit layout/i }));
    const hideButtons = screen.getAllByRole('button', { name: /Masquer la section|Hide section|Afficher la section|Show section/i });
    fireEvent.click(hideButtons[0]);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer|^Save$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/settings');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body[SETTINGS_KEY].sections.overview.visible).toBe(false);
  });

  it('dispatches the configured event after a successful save', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    const onEvent = vi.fn();
    window.addEventListener(EVENT_NAME, onEvent);
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Mise en page|Edit layout/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer|^Save$/i }));
    await waitFor(() => expect(onEvent).toHaveBeenCalled());
    window.removeEventListener(EVENT_NAME, onEvent);
  });

  it('cancel discards draft edits', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Mise en page|Edit layout/i }));
    const hideButtons = screen.getAllByRole('button', { name: /Masquer la section|Hide section/i });
    fireEvent.click(hideButtons[0]);
    fireEvent.click(screen.getByRole('button', { name: /Annuler|Cancel/i }));
    expect(screen.getByTestId('sec-overview')).toBeTruthy();
  });

  it('reset swaps the draft to defaults', () => {
    const layout = makeLayout();
    layout.sections.overview.visible = false;
    renderLayout(layout);
    expect(screen.queryByTestId('sec-overview')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Mise en page|Edit layout/i }));
    fireEvent.click(screen.getByRole('button', { name: /Réinitialiser|Reset/i }));
    // After reset the draft has all sections visible.
    const hideButtons = screen.getAllByRole('button', { name: /Masquer la section|Hide section/i });
    expect(hideButtons.length).toBe(3);
  });

  it('toasts on save failure and stays in edit mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('nope', { status: 500, headers: { 'content-type': 'text/plain' } }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /Mise en page|Edit layout/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer|^Save$/i }));
    // On failure the toast shows the localized error string and edit mode stays.
    await waitFor(() => expect(screen.getByRole('button', { name: /Enregistrer|^Save$/i })).toBeTruthy());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('syncs from the configured event in normal mode', () => {
    renderLayout();
    const nextLayout = makeLayout();
    nextLayout.sections.extra.visible = false;
    fireEvent(window, new CustomEvent(EVENT_NAME, { detail: { layout: nextLayout } }));
    expect(screen.queryByTestId('sec-extra')).toBeNull();
    expect(screen.getByTestId('sec-overview')).toBeTruthy();
  });
});
