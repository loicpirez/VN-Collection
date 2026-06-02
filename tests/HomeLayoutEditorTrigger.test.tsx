// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { HomeLayoutEditorTrigger, HOME_LAYOUT_OPEN_EVENT } from '@/components/HomeLayoutEditorTrigger';
import { DEFAULT_HOME_LAYOUT, HOME_LAYOUT_EVENT, HOME_SECTION_IDS } from '@/lib/home-section-layout';

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

function openDialog() {
  act(() => {
    window.dispatchEvent(new CustomEvent(HOME_LAYOUT_OPEN_EVENT));
  });
}

describe('HomeLayoutEditorTrigger', () => {
  beforeEach(() => {
    refreshMock.mockClear();
    global.fetch = okFetch() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing until the open event fires', () => {
    renderWithProviders(<HomeLayoutEditorTrigger layout={DEFAULT_HOME_LAYOUT} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the dialog with one sortable row per home section', () => {
    renderWithProviders(<HomeLayoutEditorTrigger layout={DEFAULT_HOME_LAYOUT} />);
    openDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(within(dialog).getAllByRole('listitem').length).toBe(HOME_SECTION_IDS.length);
  });

  it('toggles a section visibility and persists a partial PATCH', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<HomeLayoutEditorTrigger layout={DEFAULT_HOME_LAYOUT} />);
    openDialog();
    const dialog = screen.getByRole('dialog');
    const rows = within(dialog).getAllByRole('listitem');
    // Each row's last button is the visibility toggle.
    const toggle = within(rows[0]).getByRole('button', { name: /Masquer la section|Hide section/i });
    fireEvent.click(toggle);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.home_section_layout_v1.sections).toBeTruthy();
    const firstId = DEFAULT_HOME_LAYOUT.order[0];
    expect(body.home_section_layout_v1.sections[firstId].visible).toBe(false);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('reset-all PATCHes null, fires the layout event, and closes the dialog', async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    const onLayout = vi.fn();
    window.addEventListener(HOME_LAYOUT_EVENT, onLayout);
    renderWithProviders(<HomeLayoutEditorTrigger layout={DEFAULT_HOME_LAYOUT} />);
    openDialog();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Réinitialiser|Reset/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.home_section_layout_v1).toBeNull();
    await waitFor(() => expect(onLayout).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    window.removeEventListener(HOME_LAYOUT_EVENT, onLayout);
  });

  it('toasts and keeps the dialog open when reset-all fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'reset-failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<HomeLayoutEditorTrigger layout={DEFAULT_HOME_LAYOUT} />);
    openDialog();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Réinitialiser|Reset/i }));
    await waitFor(() => expect(document.body.textContent).toContain('reset-failed'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('closes on the close button', () => {
    renderWithProviders(<HomeLayoutEditorTrigger layout={DEFAULT_HOME_LAYOUT} />);
    openDialog();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Fermer|Close/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on a backdrop click', () => {
    const { container } = renderWithProviders(<HomeLayoutEditorTrigger layout={DEFAULT_HOME_LAYOUT} />);
    void container;
    openDialog();
    const dialog = screen.getByRole('dialog');
    // The backdrop is the dialog's parent (the fixed overlay div).
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('toasts and keeps the dialog open when the visibility PATCH fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'home-toggle-failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<HomeLayoutEditorTrigger layout={DEFAULT_HOME_LAYOUT} />);
    openDialog();
    const dialog = screen.getByRole('dialog');
    const rows = within(dialog).getAllByRole('listitem');
    fireEvent.click(within(rows[0]).getByRole('button', { name: /Masquer la section|Hide section/i }));
    await waitFor(() => expect(document.body.textContent).toContain('home-toggle-failed'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('re-syncs local state to the layout prop each time it re-opens', () => {
    const customLayout = {
      ...DEFAULT_HOME_LAYOUT,
      sections: {
        ...DEFAULT_HOME_LAYOUT.sections,
        anniversary: { visible: false, collapsed: false },
      },
    };
    renderWithProviders(<HomeLayoutEditorTrigger layout={customLayout} />);
    openDialog();
    const dialog = screen.getByRole('dialog');
    // The anniversary row's label is struck-through (hidden) - find a
    // show-section button reflecting the hidden state.
    expect(within(dialog).getAllByRole('button', { name: /Afficher la section|Show section/i }).length).toBeGreaterThanOrEqual(1);
  });
});
