// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { SeriesDetailLayout, isValidSeriesSectionId } from '@/components/SeriesDetailLayout';
import { defaultSeriesDetailLayoutV1, SERIES_DETAIL_LAYOUT_EVENT } from '@/lib/series-detail-layout';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
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

const sectionNodes = {
  hero: <div data-testid="sec-hero">Hero body</div>,
  works: <div data-testid="sec-works">Works body</div>,
  stats: <div data-testid="sec-stats">Stats body</div>,
};

describe('SeriesDetailLayout', () => {
  beforeEach(() => {
    refreshMock.mockClear();
    global.fetch = okFetch() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the provided visible sections directly when not collapsed by default', () => {
    renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={defaultSeriesDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    expect(screen.getByTestId('sec-hero')).toBeTruthy();
    expect(screen.getByTestId('sec-works')).toBeTruthy();
    expect(screen.getByTestId('sec-stats')).toBeTruthy();
  });

  it('wraps a collapsed-by-default section in a collapsible header (body hidden until expand)', () => {
    const layout = defaultSeriesDetailLayoutV1();
    layout.sections.stats.collapsedByDefault = true;
    renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={layout} sectionNodes={sectionNodes} />,
    );
    // Stats body hidden behind a collapsed header (labelled "Statistiques").
    expect(screen.queryByTestId('sec-stats')).toBeNull();
    const header = screen.getByRole('button', { name: /Statistiques|Statistics/i });
    fireEvent.click(header);
    expect(screen.getByTestId('sec-stats')).toBeTruthy();
  });

  it('enters edit mode and lists editable rows with drag handles', () => {
    renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={defaultSeriesDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    const handles = screen.getAllByRole('button', { name: /Glisser|Drag|déplacer/i });
    expect(handles.length).toBe(3);
  });

  it('hides a section then saves the layout', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={defaultSeriesDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    const rows = screen.getAllByRole('listitem');
    fireEvent.click(within(rows[0]).getByRole('button', { name: /Masquer|Hide/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer|Save/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.series_detail_section_layout_v1.sections.hero.visible).toBe(false);
    // Edit mode closes after a successful save (Save button gone).
    await waitFor(() => expect(screen.queryByRole('button', { name: /Enregistrer|Save/i })).toBeNull());
  });

  it('toggles a collapse-by-default checkbox in edit mode', () => {
    renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={defaultSeriesDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
  });

  it('cancel discards edits', () => {
    renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={defaultSeriesDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    const rows = screen.getAllByRole('listitem');
    fireEvent.click(within(rows[0]).getByRole('button', { name: /Masquer|Hide/i }));
    fireEvent.click(screen.getByRole('button', { name: /Annuler|Cancel/i }));
    expect(screen.getByTestId('sec-hero')).toBeTruthy();
  });

  it('reset swaps the draft to defaults', () => {
    const layout = defaultSeriesDetailLayoutV1();
    layout.sections.hero.visible = false;
    renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={layout} sectionNodes={sectionNodes} />,
    );
    expect(screen.queryByTestId('sec-hero')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /Valeurs par défaut|Reset/i }));
    // Draft now has hero visible; row exists.
    expect(screen.getAllByRole('listitem').length).toBe(3);
  });

  it('toasts on save failure and stays in edit mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'series-save-fail' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={defaultSeriesDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer|Save/i }));
    await waitFor(() => expect(document.body.textContent).toContain('series-save-fail'));
    expect(screen.getByRole('button', { name: /Enregistrer|Save/i })).toBeTruthy();
  });

  it('syncs from a SERIES_DETAIL_LAYOUT_EVENT', () => {
    renderWithProviders(
      <SeriesDetailLayout seriesId={5} initialLayout={defaultSeriesDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    const next = defaultSeriesDetailLayoutV1();
    next.sections.works.visible = false;
    fireEvent(window, new CustomEvent(SERIES_DETAIL_LAYOUT_EVENT, { detail: { layout: next } }));
    expect(screen.queryByTestId('sec-works')).toBeNull();
  });

  it('isValidSeriesSectionId guards known ids', () => {
    expect(isValidSeriesSectionId('hero')).toBe(true);
    expect(isValidSeriesSectionId('nope')).toBe(false);
  });
});
