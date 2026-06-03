// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { GameLog } from '@/components/GameLog';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { TrackingGameLogEntry } from '@/lib/tracking-client-shape';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

const BASE_TS = Date.UTC(2026, 0, 2, 9, 0, 0);

function entry(overrides: Partial<TrackingGameLogEntry> = {}): TrackingGameLogEntry {
  return {
    id: 1,
    vn_id: 'v90001',
    note: 'First observation',
    logged_at: BASE_TS,
    session_minutes: null,
    created_at: BASE_TS,
    updated_at: BASE_TS,
    ...overrides,
  };
}

function entryResponse(e: TrackingGameLogEntry) {
  return new Response(JSON.stringify({ entry: e }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function errorResponse(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'content-type': 'application/json' } });
}

function renderLog(props: Partial<React.ComponentProps<typeof GameLog>> = {}) {
  return renderWithProviders(
    <GameLog vnId="v90001" initial={[]} {...props} />,
    { locale: 'en' },
  );
}

describe('GameLog branches', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(entryResponse(entry({ id: 99 })));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the empty-state copy with no entries', () => {
    renderLog({ initial: [] });
    expect(screen.getByText(t.gameLog.empty)).toBeInTheDocument();
  });

  it('groups entries by day and renders the per-entry timestamp + relative time', () => {
    renderLog({
      initial: [
        entry({ id: 1, logged_at: BASE_TS }),
        entry({ id: 2, note: 'Second beat', logged_at: BASE_TS + 60 * 60 * 1000 }),
      ],
    });
    expect(screen.queryByText(t.gameLog.empty)).toBeNull();
    expect(screen.getByText('First observation')).toBeInTheDocument();
    expect(screen.getByText('Second beat')).toBeInTheDocument();
    // Two day-heading <ol> entries are rendered as list items.
    expect(screen.getAllByRole('listitem').length).toBe(2);
  });

  it('renders the session badge when an entry carries session_minutes', () => {
    renderLog({ initial: [entry({ id: 3, session_minutes: 42 })] });
    expect(screen.getByText(t.gameLog.atSession.replace('{n}', '42'))).toBeInTheDocument();
  });

  it('does not POST when the note is only whitespace', () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderLog();
    const textarea = screen.getByLabelText(t.gameLog.placeholder);
    fireEvent.change(textarea, { target: { value: '   ' } });
    // Add button stays disabled for whitespace-only content.
    expect(screen.getByRole('button', { name: new RegExp(t.gameLog.add) })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs a new entry and prepends it on success, clearing the textarea', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(entryResponse(entry({ id: 99, note: 'Fresh note' })));
    renderLog();
    const textarea = screen.getByLabelText(t.gameLog.placeholder) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Fresh note' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.gameLog.add) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90001/game-log');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ note: 'Fresh note', session_minutes: null });
    await waitFor(() => expect(screen.getByText('Fresh note')).toBeInTheDocument());
    expect(textarea.value).toBe('');
  });

  it('submits via Cmd/Ctrl+Enter from the textarea', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderLog();
    const textarea = screen.getByLabelText(t.gameLog.placeholder);
    fireEvent.change(textarea, { target: { value: 'Keyboard note' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('surfaces an error toast when the add POST fails', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(errorResponse('add boom'));
    renderLog();
    fireEvent.change(screen.getByLabelText(t.gameLog.placeholder), { target: { value: 'Will fail' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.gameLog.add) }));
    await waitFor(() => expect(screen.getByText('add boom')).toBeInTheDocument());
  });

  it('shows the attach-session chip when liveSessionMinutes > 0 and attaches the count', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderLog({ liveSessionMinutes: 25 });
    const chip = screen.getByRole('button', { name: t.gameLog.attachedSession.replace('{n}', '25') });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip);
    await waitFor(() => expect(screen.getByRole('button', { name: t.gameLog.attachedSessionNo }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.change(screen.getByLabelText(t.gameLog.placeholder), { target: { value: 'With session' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.gameLog.add}$`) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ session_minutes: 25 });
  });

  it('marks the counter as near-limit styling once under 100 characters remain', () => {
    const { container } = renderLog();
    const textarea = screen.getByLabelText(t.gameLog.placeholder);
    fireEvent.change(textarea, { target: { value: 'x'.repeat(7950) } });
    // remaining = 8000 - 7950 = 50 (< 100) → dropped-status text colour.
    expect(container.querySelector('.text-status-dropped')).not.toBeNull();
  });

  it('opens an entry for editing then cancels back to read mode', () => {
    renderLog({ initial: [entry({ id: 5, note: 'Editable note' })] });
    const li = screen.getByRole('listitem');
    fireEvent.click(within(li).getByRole('button', { name: t.gameLog.edit }));
    expect(screen.getByDisplayValue('Editable note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.gameLog.cancel) }));
    expect(screen.queryByDisplayValue('Editable note')).toBeNull();
    expect(screen.getByText('Editable note')).toBeInTheDocument();
  });

  it('closes the edit box on Escape', () => {
    renderLog({ initial: [entry({ id: 6, note: 'Esc note' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.edit }));
    const editArea = screen.getByDisplayValue('Esc note');
    fireEvent.keyDown(editArea, { key: 'Escape' });
    expect(screen.queryByDisplayValue('Esc note')).toBeNull();
  });

  it('PATCHes an edited entry on save and replaces the row', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(entryResponse(entry({ id: 7, note: 'Updated text' })));
    renderLog({ initial: [entry({ id: 7, note: 'Old text' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.edit }));
    const editArea = screen.getByDisplayValue('Old text');
    fireEvent.change(editArea, { target: { value: 'Updated text' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.gameLog.save}$`) }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true));
    const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(JSON.parse(patch[1].body)).toMatchObject({ id: 7, note: 'Updated text' });
    await waitFor(() => expect(screen.getByText('Updated text')).toBeInTheDocument());
  });

  it('saves an edit via Cmd/Ctrl+Enter inside the edit textarea', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(entryResponse(entry({ id: 8, note: 'Kbd edit' })));
    renderLog({ initial: [entry({ id: 8, note: 'Before' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.edit }));
    const editArea = screen.getByDisplayValue('Before');
    fireEvent.change(editArea, { target: { value: 'Kbd edit' } });
    fireEvent.keyDown(editArea, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true));
  });

  it('surfaces an error toast when the edit PATCH fails', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(errorResponse('edit boom'));
    renderLog({ initial: [entry({ id: 9, note: 'Edit fail' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.edit }));
    fireEvent.change(screen.getByDisplayValue('Edit fail'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.gameLog.save}$`) }));
    await waitFor(() => expect(screen.getByText('edit boom')).toBeInTheDocument());
  });

  it('deletes an entry after confirming and removes the row', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const { user } = renderLog({ initial: [entry({ id: 10, note: 'Delete me' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.delete }));
    const confirmBtn = await screen.findByRole('button', { name: t.common.confirm });
    await user.click(confirmBtn);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(true));
    const del = fetchMock.mock.calls.find((c) => c[1]?.method === 'DELETE')!;
    expect(String(del[0])).toContain('/api/collection/v90001/game-log?entry=10');
    await waitFor(() => expect(screen.queryByText('Delete me')).toBeNull());
  });

  it('performs no DELETE when the remove confirm is cancelled', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { user } = renderLog({ initial: [entry({ id: 11, note: 'Keep me' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.delete }));
    const cancelBtn = await screen.findByRole('button', { name: t.common.cancel });
    await user.click(cancelBtn);
    await waitFor(() => expect(screen.queryByRole('button', { name: t.common.cancel })).toBeNull());
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false);
    expect(screen.getByText('Keep me')).toBeInTheDocument();
  });

  it('surfaces an error toast when the delete request fails', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(errorResponse('delete boom'));
    const { user } = renderLog({ initial: [entry({ id: 12, note: 'Doomed' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.delete }));
    await user.click(await screen.findByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(screen.getByText('delete boom')).toBeInTheDocument());
  });
});
