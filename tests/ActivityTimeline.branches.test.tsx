// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { renderWithProviders } from './helpers/render-component';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { TrackingActivityEntry } from '@/lib/tracking-client-shape';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;
const VN_ID = 'v90001';

function entry(over: Partial<TrackingActivityEntry> = {}): TrackingActivityEntry {
  return {
    id: 1,
    vn_id: VN_ID,
    kind: 'manual',
    payload: { text: 'Note body X' },
    occurred_at: 1_700_000_000_000,
    ...over,
  };
}

function jsonOk(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function jsonErr(status = 500, body: unknown = { error: 'boom' }): Response {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn(async () => jsonOk({})) as unknown as typeof fetch;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ActivityTimeline branches', () => {
  it('renders the empty state when there are no entries', () => {
    renderWithProviders(<ActivityTimeline vnId={VN_ID} initial={[]} />, { locale: 'en' });
    expect(screen.getByText(t.activity.empty)).toBeInTheDocument();
  });

  it('renders every summary kind branch and the delete control only on manual rows', () => {
    const initial: TrackingActivityEntry[] = [
      entry({ id: 1, kind: 'status', payload: { from: 'playing', to: 'finished' } }),
      // status with missing from/to exercises the `?? '-'` fallback.
      entry({ id: 2, kind: 'status', payload: {} }),
      entry({ id: 3, kind: 'rating', payload: { from: 85, to: 92 } }),
      // rating with non-number value exercises formatRating '-' branch.
      entry({ id: 4, kind: 'rating', payload: { from: 'nope', to: null } }),
      entry({ id: 5, kind: 'playtime', payload: { delta: 30, to: 600 } }),
      // playtime with non-number delta exercises the `: 0` branch and empty sign.
      entry({ id: 6, kind: 'playtime', payload: { delta: 'x', to: 0 } }),
      // negative delta keeps the empty sign branch (sign only added when > 0).
      entry({ id: 7, kind: 'playtime', payload: { delta: -15, to: 5 } }),
      entry({ id: 8, kind: 'favorite', payload: { to: true } }),
      entry({ id: 9, kind: 'favorite', payload: { to: false } }),
      entry({ id: 10, kind: 'started', payload: { to: '2024-01-02' } }),
      entry({ id: 11, kind: 'started', payload: {} }),
      entry({ id: 12, kind: 'finished', payload: { to: '2024-03-04' } }),
      entry({ id: 18, kind: 'finished', payload: {} }),
      entry({ id: 13, kind: 'note', payload: { length: 42 } }),
      // note with non-number length exercises the `: 0` branch.
      entry({ id: 14, kind: 'note', payload: {} }),
      entry({ id: 15, kind: 'manual', payload: { text: 'Manual text X' } }),
      // manual with no text exercises the `?? ''` branch.
      entry({ id: 16, kind: 'manual', payload: {} }),
      // null payload exercises the `payload ?? {}` branch.
      entry({ id: 17, kind: 'manual', payload: null }),
    ];
    renderWithProviders(<ActivityTimeline vnId={VN_ID} initial={initial} />, { locale: 'en' });

    expect(screen.getByText(/playing/)).toBeInTheDocument();
    expect(screen.getByText('Manual text X')).toBeInTheDocument();
    expect(screen.getByText(t.activity.kind.favoriteOn)).toBeInTheDocument();
    expect(screen.getByText(t.activity.kind.favoriteOff)).toBeInTheDocument();

    // Three manual rows each get a delete button; the typed kinds do not.
    expect(screen.getAllByRole('button', { name: t.common.delete })).toHaveLength(3);
  });

  it('falls back to the History icon for an unknown kind without throwing', () => {
    // Cast through unknown so we can drive the ICONS[kind] ?? History fallback.
    const rogue = { id: 1, vn_id: VN_ID, kind: 'mystery', payload: null, occurred_at: 1 } as unknown as TrackingActivityEntry;
    renderWithProviders(<ActivityTimeline vnId={VN_ID} initial={[rogue]} />, { locale: 'en' });
    expect(screen.getByText(t.activity.title)).toBeInTheDocument();
  });

  it('keeps the add button disabled until the input has non-whitespace text', async () => {
    const { user } = renderWithProviders(<ActivityTimeline vnId={VN_ID} initial={[]} />, { locale: 'en' });
    const addBtn = screen.getByRole('button', { name: new RegExp(t.activity.add) });
    expect(addBtn).toBeDisabled();
    const input = screen.getByLabelText(t.activity.placeholder);
    await user.type(input, '   ');
    expect(addBtn).toBeDisabled();
    // Enter with whitespace-only text hits the empty-trim guard (no fetch).
    const fetchMock = vi.fn(async () => jsonOk({}));
    global.fetch = fetchMock as unknown as typeof fetch;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(fetchMock).not.toHaveBeenCalled();
    await user.type(input, 'Real note');
    expect(addBtn).toBeEnabled();
  });

  it('adds an entry on a successful POST and clears the input', async () => {
    const created = entry({ id: 99, kind: 'manual', payload: { text: 'Fresh note' }, occurred_at: 1_700_000_500_000 });
    global.fetch = vi.fn(async () => jsonOk({ entry: created })) as unknown as typeof fetch;
    const { user } = renderWithProviders(<ActivityTimeline vnId={VN_ID} initial={[]} />, { locale: 'en' });
    const input = screen.getByLabelText(t.activity.placeholder);
    await user.type(input, 'Fresh note');
    await user.click(screen.getByRole('button', { name: new RegExp(t.activity.add) }));
    await waitFor(() => expect(screen.getByText('Fresh note')).toBeInTheDocument());
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('submits via the Enter key', async () => {
    const created = entry({ id: 77, kind: 'manual', payload: { text: 'Enter note' } });
    const fetchMock = vi.fn(async () => jsonOk({ entry: created }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { user } = renderWithProviders(<ActivityTimeline vnId={VN_ID} initial={[]} />, { locale: 'en' });
    const input = screen.getByLabelText(t.activity.placeholder);
    await user.type(input, 'Enter note{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Enter note')).toBeInTheDocument());
  });

  it('surfaces a toast when the decoder rejects the POST body', async () => {
    // ok response but missing `entry` makes decodeActivityEntryResponse return null.
    global.fetch = vi.fn(async () => jsonOk({})) as unknown as typeof fetch;
    const { user } = renderWithProviders(<ActivityTimeline vnId={VN_ID} initial={[]} />, { locale: 'en' });
    await user.type(screen.getByLabelText(t.activity.placeholder), 'Bad decode');
    await user.click(screen.getByRole('button', { name: new RegExp(t.activity.add) }));
    expect(await screen.findByText(t.common.error)).toBeInTheDocument();
  });

  it('surfaces a toast when the POST is not ok', async () => {
    global.fetch = vi.fn(async () => jsonErr(500, { error: 'server-down' })) as unknown as typeof fetch;
    const { user } = renderWithProviders(<ActivityTimeline vnId={VN_ID} initial={[]} />, { locale: 'en' });
    await user.type(screen.getByLabelText(t.activity.placeholder), 'Will fail');
    await user.click(screen.getByRole('button', { name: new RegExp(t.activity.add) }));
    expect(await screen.findByText('server-down')).toBeInTheDocument();
  });

  it('removes a manual entry after confirming the dialog on a successful DELETE', async () => {
    const initial = [entry({ id: 5, kind: 'manual', payload: { text: 'Removable X' } })];
    global.fetch = vi.fn(async () => jsonOk({})) as unknown as typeof fetch;
    const { user } = renderWithProviders(<ActivityTimeline vnId={VN_ID} initial={initial} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: t.common.delete }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(screen.queryByText('Removable X')).not.toBeInTheDocument());
  });

  it('keeps the entry when the confirm dialog is cancelled', async () => {
    const initial = [entry({ id: 6, kind: 'manual', payload: { text: 'Stays X' } })];
    const fetchMock = vi.fn(async () => jsonOk({}));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { user } = renderWithProviders(<ActivityTimeline vnId={VN_ID} initial={initial} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: t.common.delete }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: t.common.cancel }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText('Stays X')).toBeInTheDocument();
    // DELETE request must never have fired after a cancel.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a second delete request while the first confirmation is open', async () => {
    const initial = [entry({ id: 19, kind: 'manual', payload: { text: 'Duplicate delete X' } })];
    const fetchMock = vi.fn(async () => jsonOk({}));
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ActivityTimeline vnId={VN_ID} initial={initial} />, { locale: 'en' });
    const deleteButton = screen.getByRole('button', { name: t.common.delete });

    act(() => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a toast when the DELETE request is not ok', async () => {
    const initial = [entry({ id: 7, kind: 'manual', payload: { text: 'Delete fails X' } })];
    global.fetch = vi.fn(async () => jsonErr(404, { error: 'gone' })) as unknown as typeof fetch;
    const { user } = renderWithProviders(<ActivityTimeline vnId={VN_ID} initial={initial} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: t.common.delete }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: t.common.confirm }));
    expect(await screen.findByText('gone')).toBeInTheDocument();
    expect(screen.getByText('Delete fails X')).toBeInTheDocument();
  });

  it('ignores a second add while the first POST is still in flight', async () => {
    // First POST never resolves: the in-flight guard makes the second
    // beginMutation() return null so add() bails before fetching again.
    // The Add button disables while busy, so the second invocation is driven
    // through the still-enabled input's Enter handler.
    let resolveFirst: ((r: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((res) => { resolveFirst = res; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { user } = renderWithProviders(<ActivityTimeline vnId={VN_ID} initial={[]} />, { locale: 'en' });
    const input = screen.getByLabelText(t.activity.placeholder);
    await user.type(input, 'Pending note');
    const addBtn = screen.getByRole('button', { name: new RegExp(t.activity.add) });
    await user.click(addBtn);
    await waitFor(() => expect(addBtn).toBeDisabled());
    // Enter while busy re-enters add(); the guard returns before any fetch.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst?.(jsonOk({ entry: entry({ id: 1, payload: { text: 'Pending note' } }) }));
    await waitFor(() => expect(screen.getByText('Pending note')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('drops a resolved add when the VN changed mid-flight (ownership guard)', async () => {
    let resolveAdd: ((r: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((res) => { resolveAdd = res; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { user, rerender } = renderWithProviders(
      <ActivityTimeline vnId={VN_ID} initial={[]} />,
      { locale: 'en' },
    );
    await user.type(screen.getByLabelText(t.activity.placeholder), 'Switch note');
    await user.click(screen.getByRole('button', { name: new RegExp(t.activity.add) }));
    // Navigate to a different VN while the POST is still pending.
    rerender(<ActivityTimeline vnId="v90002" initial={[entry({ id: 5, vn_id: 'v90002', payload: { text: 'Other VN X' } })]} />);
    // Now resolve the stale POST; the ownership guard must discard its result.
    resolveAdd?.(jsonOk({ entry: entry({ id: 1, payload: { text: 'Switch note' } }) }));
    await waitFor(() => expect(screen.getByText('Other VN X')).toBeInTheDocument());
    expect(screen.queryByText('Switch note')).not.toBeInTheDocument();
  });

  it('swallows a rejected add when the VN changed mid-flight', async () => {
    let rejectAdd: ((e: Error) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((_res, rej) => { rejectAdd = rej; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { user, rerender } = renderWithProviders(
      <ActivityTimeline vnId={VN_ID} initial={[]} />,
      { locale: 'en' },
    );
    await user.type(screen.getByLabelText(t.activity.placeholder), 'Doomed note');
    await user.click(screen.getByRole('button', { name: new RegExp(t.activity.add) }));
    rerender(<ActivityTimeline vnId="v90002" initial={[entry({ id: 9, vn_id: 'v90002', payload: { text: 'New VN X' } })]} />);
    // Reject the stale POST; the ownership guard suppresses the toast.
    rejectAdd?.(new Error('stale failure'));
    await waitFor(() => expect(screen.getByText('New VN X')).toBeInTheDocument());
    expect(screen.queryByText('stale failure')).not.toBeInTheDocument();
  });

  it('discards a resolved delete when the VN changed mid-flight', async () => {
    let resolveDelete: ((r: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((res) => { resolveDelete = res; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const initial = [entry({ id: 3, kind: 'manual', payload: { text: 'Doomed row X' } })];
    const { user, rerender } = renderWithProviders(
      <ActivityTimeline vnId={VN_ID} initial={initial} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: t.common.delete }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: t.common.confirm }));
    // Switch VNs before the DELETE resolves.
    rerender(<ActivityTimeline vnId="v90002" initial={[entry({ id: 4, vn_id: 'v90002', kind: 'manual', payload: { text: 'Fresh row X' } })]} />);
    resolveDelete?.(jsonOk({}));
    await waitFor(() => expect(screen.getByText('Fresh row X')).toBeInTheDocument());
    // The ownership guard prevented the stale filter from touching the new list.
    expect(screen.getByText('Fresh row X')).toBeInTheDocument();
  });

  it('swallows a failed delete when the VN changed mid-flight', async () => {
    let rejectDelete: ((e: Error) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((_res, rej) => { rejectDelete = rej; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const initial = [entry({ id: 3, kind: 'manual', payload: { text: 'Doomed row Y' } })];
    const { user, rerender } = renderWithProviders(
      <ActivityTimeline vnId={VN_ID} initial={initial} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: t.common.delete }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: t.common.confirm }));
    rerender(<ActivityTimeline vnId="v90002" initial={[entry({ id: 4, vn_id: 'v90002', kind: 'manual', payload: { text: 'Fresh row Y' } })]} />);
    // Reject the stale DELETE; the catch ownership guard suppresses the toast.
    rejectDelete?.(new Error('stale delete failure'));
    await waitFor(() => expect(screen.getByText('Fresh row Y')).toBeInTheDocument());
    expect(screen.queryByText('stale delete failure')).not.toBeInTheDocument();
  });

  it('resyncs entries and resets the input when the vnId prop changes', async () => {
    const { rerender } = renderWithProviders(
      <ActivityTimeline vnId={VN_ID} initial={[entry({ id: 1, kind: 'manual', payload: { text: 'First VN X' } })]} />,
      { locale: 'en' },
    );
    expect(screen.getByText('First VN X')).toBeInTheDocument();
    rerender(
      <ActivityTimeline vnId="v90002" initial={[entry({ id: 2, vn_id: 'v90002', kind: 'manual', payload: { text: 'Second VN X' } })]} />,
    );
    await waitFor(() => expect(screen.getByText('Second VN X')).toBeInTheDocument());
    expect(screen.queryByText('First VN X')).not.toBeInTheDocument();
  });
});
