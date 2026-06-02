// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { SourceSwitcher } from '@/components/SourceSwitcher';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function okResponse() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SourceSwitcher', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    global.fetch = vi.fn().mockResolvedValue(okResponse());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the three segmented options with the current one pressed', () => {
    renderWithProviders(
      <SourceSwitcher vnId="v90001" field="description" current="auto" vndbAvailable egsAvailable />,
    );
    const auto = screen.getByRole('button', { name: 'Auto' });
    expect(auto.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'VNDB' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'EGS' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('PATCHes the chosen field, optimistically presses it, and refreshes on success', async () => {
    renderWithProviders(
      <SourceSwitcher vnId="v90001" field="description" current="auto" vndbAvailable egsAvailable />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'EGS' }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe('/api/collection/v90001/source-pref');
    expect(calls[0][1]).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse(calls[0][1].body)).toEqual({ description: 'egs' });
    expect(screen.getByRole('button', { name: 'EGS' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('does nothing when the already-selected option is clicked', () => {
    renderWithProviders(
      <SourceSwitcher vnId="v90001" field="image" current="vndb" vndbAvailable egsAvailable />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'VNDB' }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reverts the optimistic choice and toasts on a failed PATCH', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'nope' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderWithProviders(
      <SourceSwitcher vnId="v90001" field="rating" current="auto" vndbAvailable egsAvailable />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'VNDB' }));
    // Error toast surfaces the server message.
    await waitFor(() => expect(screen.getByText('nope')).toBeTruthy());
    // Optimistic value reverted back to auto.
    expect(screen.getByRole('button', { name: 'Auto' }).getAttribute('aria-pressed')).toBe('true');
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('disables the VNDB option when VNDB has no value and it is not currently selected', () => {
    renderWithProviders(
      <SourceSwitcher vnId="v90001" field="brand" current="auto" vndbAvailable={false} egsAvailable />,
    );
    expect((screen.getByRole('button', { name: 'VNDB' }) as HTMLButtonElement).disabled).toBe(true);
    // EGS is available, so it stays enabled.
    expect((screen.getByRole('button', { name: 'EGS' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the EGS option enabled when EGS is unavailable but is the current selection', () => {
    renderWithProviders(
      <SourceSwitcher vnId="v90001" field="playtime" current="egs" vndbAvailable egsAvailable={false} />,
    );
    // current === 'egs' so optimistic === 'egs' keeps it interactive despite egsAvailable=false.
    expect((screen.getByRole('button', { name: 'EGS' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'EGS' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('ignores a stale success after the VN identity changes', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const { rerender } = renderWithProviders(
      <SourceSwitcher vnId="v90001" field="description" current="auto" vndbAvailable egsAvailable />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'EGS' }));
    rerender(<SourceSwitcher vnId="v90002" field="description" current="auto" vndbAvailable egsAvailable />);
    resolveFetch(okResponse());
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('ignores a stale rejection after the VN identity changes', async () => {
    let rejectFetch: (error: Error) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject;
    }));
    const { rerender } = renderWithProviders(
      <SourceSwitcher vnId="v90001" field="description" current="auto" vndbAvailable egsAvailable />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'EGS' }));
    rerender(<SourceSwitcher vnId="v90002" field="description" current="auto" vndbAvailable egsAvailable />);
    rejectFetch(new Error('stale failure'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('stale failure')).toBeNull();
  });
});
