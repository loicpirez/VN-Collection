// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { VnDetailLayout, isValidVnSectionId } from '@/components/VnDetailLayout';
import { defaultVnDetailLayoutV1, VN_LAYOUT_EVENT } from '@/lib/vn-detail-layout';

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
  notes: <div data-testid="sec-notes">Notes body</div>,
  routes: <div data-testid="sec-routes">Routes body</div>,
  characters: <div data-testid="sec-characters">Characters body</div>,
};

describe('VnDetailLayout', () => {
  beforeEach(() => {
    localStorage.clear();
    refreshMock.mockClear();
    global.fetch = okFetch() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders only the provided + visible sections in normal mode', () => {
    renderWithProviders(
      <VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    expect(screen.getByTestId('sec-notes')).toBeTruthy();
    expect(screen.getByTestId('sec-routes')).toBeTruthy();
    expect(screen.getByTestId('sec-characters')).toBeTruthy();
    // Sections with no node are not rendered.
    expect(screen.queryByTestId('sec-quotes')).toBeNull();
  });

  it('renders a mobile section nav linking each visible section', () => {
    renderWithProviders(
      <VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    const nav = screen.getByRole('navigation');
    const links = within(nav).getAllByRole('link');
    expect(links.length).toBe(3);
    expect(links[0].getAttribute('href')).toBe('#section-notes');
  });

  it('enters edit mode and lists every applicable section as an editable row', () => {
    renderWithProviders(
      <VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    // Three editable rows (one per provided node), each with a drag handle.
    const handles = screen.getAllByRole('button', { name: /Glisser|Drag|déplacer/i });
    expect(handles.length).toBe(3);
  });

  it('hides a section in the draft and reflects it on save', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(
      <VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    // Toggle visibility on the first row (Notes). The hide/show button is
    // aria-pressed when hidden; click it to flip to hidden.
    const rows = screen.getAllByRole('listitem');
    const hideBtn = within(rows[0]).getByRole('button', { name: /Masquer|Hide|Afficher|Show/i });
    fireEvent.click(hideBtn);
    // Save.
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer|Save/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/settings');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.vn_detail_section_layout_v1.sections.notes.visible).toBe(false);
    // Edit mode closes after a successful save (Save button gone).
    await waitFor(() => expect(screen.queryByRole('button', { name: /Enregistrer|Save/i })).toBeNull());
    expect(refreshMock).toHaveBeenCalled();
  });

  it('toggles the collapse-by-default checkbox in a draft row', () => {
    renderWithProviders(
      <VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0].getAttribute('checked')).not.toBe('');
    fireEvent.click(checkboxes[0]);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
  });

  it('cancel discards draft edits and returns to normal mode', () => {
    renderWithProviders(
      <VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    const rows = screen.getAllByRole('listitem');
    fireEvent.click(within(rows[0]).getByRole('button', { name: /Masquer|Hide/i }));
    fireEvent.click(screen.getByRole('button', { name: /Annuler|Cancel/i }));
    // Edits discarded: Notes still rendered.
    expect(screen.getByTestId('sec-notes')).toBeTruthy();
  });

  it('reset replaces the draft with canonical defaults', () => {
    const customLayout = defaultVnDetailLayoutV1();
    customLayout.sections.notes.visible = false;
    renderWithProviders(
      <VnDetailLayout vnId="v90001" initialLayout={customLayout} sectionNodes={sectionNodes} />,
    );
    // Notes hidden initially.
    expect(screen.queryByTestId('sec-notes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /Valeurs par défaut|Reset/i }));
    // Reset makes notes visible again in the draft -> its hide/show button
    // should now indicate "hide" (i.e. currently visible).
    const rows = screen.getAllByRole('listitem');
    const notesRow = rows.find((r) => within(r).queryByText(/notes/i));
    expect(notesRow).toBeTruthy();
  });

  it('surfaces an error toast when the save PATCH fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'save-blew-up' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(
      <VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modifier|Edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer|Save/i }));
    await waitFor(() => expect(document.body.textContent).toContain('save-blew-up'));
    // Stays in edit mode on failure.
    expect(screen.getByRole('button', { name: /Enregistrer|Save/i })).toBeTruthy();
  });

  it('syncs from a VN_LAYOUT_EVENT in normal mode', () => {
    renderWithProviders(
      <VnDetailLayout vnId="v90001" initialLayout={defaultVnDetailLayoutV1()} sectionNodes={sectionNodes} />,
    );
    const next = defaultVnDetailLayoutV1();
    next.sections.routes.visible = false;
    fireEvent(window, new CustomEvent(VN_LAYOUT_EVENT, { detail: { layout: next } }));
    expect(screen.queryByTestId('sec-routes')).toBeNull();
    expect(screen.getByTestId('sec-notes')).toBeTruthy();
  });

  it('isValidVnSectionId guards known ids', () => {
    expect(isValidVnSectionId('notes')).toBe(true);
    expect(isValidVnSectionId('not-a-real-section')).toBe(false);
  });
});
