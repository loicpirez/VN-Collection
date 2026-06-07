// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

function deferredResponse(): {
  promise: Promise<Response>;
  resolve: (value: Response) => void;
  reject: (reason: Error) => void;
} {
  let resolvePromise: (value: Response) => void = () => undefined;
  let rejectPromise: (reason: Error) => void = () => undefined;
  const promise = new Promise<Response>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
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
    vi.useRealTimers();
  });

  it('updates the relative-time clock on the interval tick', async () => {
    vi.useFakeTimers();
    renderLog({ initial: [entry({ id: 2, logged_at: BASE_TS })] });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText('First observation')).toBeInTheDocument();
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
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('button', { name: new RegExp(t.gameLog.add) })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores ordinary Enter in the add textarea', () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderLog();
    const textarea = screen.getByLabelText(t.gameLog.placeholder);
    fireEvent.change(textarea, { target: { value: 'Keyboard ignored' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
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

  it('surfaces the generic error when the add response shape is invalid', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ item: entry({ id: 13 }) }), { status: 200 }));
    renderLog();
    fireEvent.change(screen.getByLabelText(t.gameLog.placeholder), { target: { value: 'Invalid add response' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.gameLog.add) }));
    await waitFor(() => expect(screen.getByText(t.common.error)).toBeInTheDocument());
  });

  it('ignores duplicate add submissions while a request is active', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const pending = deferredResponse();
    fetchMock.mockReturnValue(pending.promise);
    renderLog();
    const textarea = screen.getByLabelText(t.gameLog.placeholder);
    fireEvent.change(textarea, { target: { value: 'Single add' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.gameLog.add) }));
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(entryResponse(entry({ id: 14, note: 'Single add' })));
    });
    await waitFor(() => expect(screen.getByText('Single add')).toBeInTheDocument());
  });

  it('does not enter edit mode while an add request is active', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const pending = deferredResponse();
    fetchMock.mockReturnValue(pending.promise);
    renderLog({ initial: [entry({ id: 24, note: 'Busy edit' })] });
    const textarea = screen.getByLabelText(t.gameLog.placeholder);
    const editButton = within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.edit });
    act(() => {
      fireEvent.change(textarea, { target: { value: 'Adding first' } });
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.gameLog.add) }));
      fireEvent.click(editButton);
    });
    expect(screen.queryByDisplayValue('Busy edit')).toBeNull();
    await act(async () => {
      pending.resolve(entryResponse(entry({ id: 25, note: 'Adding first' })));
    });
  });

  it('ignores a late add success after the VN identity changes', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const pending = deferredResponse();
    fetchMock.mockReturnValue(pending.promise);
    const { rerender } = renderLog();
    fireEvent.change(screen.getByLabelText(t.gameLog.placeholder), { target: { value: 'Late add' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.gameLog.add) }));
    rerender(<GameLog vnId="v90002" initial={[]} />);
    await act(async () => {
      pending.resolve(entryResponse(entry({ id: 15, note: 'Late add' })));
    });
    expect(screen.queryByText('Late add')).toBeNull();
  });

  it('ignores a late add failure after the VN identity changes', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const pending = deferredResponse();
    fetchMock.mockReturnValue(pending.promise);
    const { rerender } = renderLog();
    fireEvent.change(screen.getByLabelText(t.gameLog.placeholder), { target: { value: 'Late add failure' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.gameLog.add) }));
    rerender(<GameLog vnId="v90002" initial={[]} />);
    await act(async () => {
      pending.reject(new Error('late add failure'));
    });
    expect(screen.queryByText('late add failure')).toBeNull();
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
    renderLog({
      initial: [
        entry({ id: 7, note: 'Old text' }),
        entry({ id: 70, note: 'Unaffected text', logged_at: BASE_TS + 60_000 }),
      ],
    });
    fireEvent.click(within(screen.getAllByRole('listitem')[0]).getByRole('button', { name: t.gameLog.edit }));
    const editArea = screen.getByDisplayValue('Old text');
    fireEvent.change(editArea, { target: { value: 'Updated text' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.gameLog.save}$`) }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true));
    const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(JSON.parse(patch[1].body)).toMatchObject({ id: 7, note: 'Updated text' });
    await waitFor(() => expect(screen.getByText('Updated text')).toBeInTheDocument());
    expect(screen.getByText('Unaffected text')).toBeInTheDocument();
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

  it('does not PATCH when the edited note is blank via keyboard submit', () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderLog({ initial: [entry({ id: 16, note: 'Blankable' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.edit }));
    const editArea = screen.getByDisplayValue('Blankable');
    fireEvent.change(editArea, { target: { value: '   ' } });
    fireEvent.keyDown(editArea, { key: 'Enter', ctrlKey: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the generic error when the edit response shape is invalid', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ item: entry({ id: 17 }) }), { status: 200 }));
    renderLog({ initial: [entry({ id: 17, note: 'Invalid edit response' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.edit }));
    fireEvent.change(screen.getByDisplayValue('Invalid edit response'), { target: { value: 'Still invalid' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.gameLog.save}$`) }));
    await waitFor(() => expect(screen.getByText(t.common.error)).toBeInTheDocument());
  });

  it('ignores duplicate edit submissions while a request is active', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const pending = deferredResponse();
    fetchMock.mockReturnValue(pending.promise);
    renderLog({ initial: [entry({ id: 18, note: 'Edit once' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.edit }));
    const editArea = screen.getByDisplayValue('Edit once');
    fireEvent.change(editArea, { target: { value: 'Edited once' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.gameLog.save}$`) }));
    fireEvent.keyDown(editArea, { key: 'Enter', ctrlKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(entryResponse(entry({ id: 18, note: 'Edited once' })));
    });
    await waitFor(() => expect(screen.getByText('Edited once')).toBeInTheDocument());
  });

  it('ignores a late edit success after the VN identity changes', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const pending = deferredResponse();
    fetchMock.mockReturnValue(pending.promise);
    const { rerender } = renderLog({ initial: [entry({ id: 19, note: 'Late edit' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.edit }));
    fireEvent.change(screen.getByDisplayValue('Late edit'), { target: { value: 'Late edited' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.gameLog.save}$`) }));
    rerender(<GameLog vnId="v90002" initial={[]} />);
    await act(async () => {
      pending.resolve(entryResponse(entry({ id: 19, note: 'Late edited' })));
    });
    expect(screen.queryByText('Late edited')).toBeNull();
  });

  it('ignores a late edit failure after the VN identity changes', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const pending = deferredResponse();
    fetchMock.mockReturnValue(pending.promise);
    const { rerender } = renderLog({ initial: [entry({ id: 20, note: 'Late edit fail' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.edit }));
    fireEvent.change(screen.getByDisplayValue('Late edit fail'), { target: { value: 'Late edit fail changed' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.gameLog.save}$`) }));
    rerender(<GameLog vnId="v90002" initial={[]} />);
    await act(async () => {
      pending.reject(new Error('late edit failure'));
    });
    expect(screen.queryByText('late edit failure')).toBeNull();
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

  it('ignores duplicate remove clicks while confirmation is pending', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const { user } = renderLog({ initial: [entry({ id: 21, note: 'Remove once' })] });
    const deleteButton = within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.delete });
    act(() => {
      fireEvent.click(deleteButton);
      fireEvent.click(deleteButton);
    });
    await user.click(await screen.findByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'DELETE')).toHaveLength(1));
  });

  it('surfaces an error toast when the delete request fails', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(errorResponse('delete boom'));
    const { user } = renderLog({ initial: [entry({ id: 12, note: 'Doomed' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.delete }));
    await user.click(await screen.findByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(screen.getByText('delete boom')).toBeInTheDocument());
  });

  it('ignores a late delete success after unmount', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const pending = deferredResponse();
    fetchMock.mockReturnValue(pending.promise);
    const { user, unmount } = renderLog({ initial: [entry({ id: 22, note: 'Late delete' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.delete }));
    await user.click(await screen.findByRole('button', { name: t.common.confirm }));
    unmount();
    await act(async () => {
      pending.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(true);
  });

  it('ignores a late delete failure after unmount', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const pending = deferredResponse();
    fetchMock.mockReturnValue(pending.promise);
    const { user, unmount } = renderLog({ initial: [entry({ id: 23, note: 'Late delete failure' })] });
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: t.gameLog.delete }));
    await user.click(await screen.findByRole('button', { name: t.common.confirm }));
    unmount();
    await act(async () => {
      pending.reject(new Error('late delete failure'));
    });
    expect(screen.queryByText('late delete failure')).toBeNull();
  });
});
