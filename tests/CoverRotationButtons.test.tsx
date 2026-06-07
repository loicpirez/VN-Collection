// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { CoverRotationButtons } from '@/components/CoverRotationButtons';
import { dispatchCoverChanged } from '@/lib/cover-banner-events';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

describe('CoverRotationButtons', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders rotate-left / rotate-right / reset; reset is disabled at rotation 0', () => {
    renderWithProviders(<CoverRotationButtons vnId="v90001" />);
    expect(screen.getByRole('button', { name: t.coverActions.rotateLeft })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.coverActions.rotateRight })).toBeTruthy();
    const reset = screen.getByRole('button', { name: t.coverActions.resetRotation });
    expect((reset as HTMLButtonElement).disabled).toBe(true);
    expect(reset.getAttribute('data-rotation-active')).toBe('false');
  });

  it('PATCHes the new rotation when rotating right', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<CoverRotationButtons vnId="v90001" />);
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.rotateRight }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90001/cover');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ rotation: 90 });
  });

  it('PATCHes the wrapped rotation when rotating left from zero', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<CoverRotationButtons vnId="v90001" />);
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.rotateLeft }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ rotation: 270 });
  });

  it('supports bottom-right and bottom-left anchors', () => {
    const { rerender } = renderWithProviders(<CoverRotationButtons vnId="v90001" anchor="bottom-right" />);
    expect(screen.getByTestId('cover-rotation-controls').className).toContain('right-1 bottom-1');
    rerender(<CoverRotationButtons vnId="v90001" anchor="bottom-left" />);
    expect(screen.getByTestId('cover-rotation-controls').className).toContain('left-1 bottom-1');
  });

  it('starts with a rotated value and resets to 0 via PATCH', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<CoverRotationButtons vnId="v90001" initialRotation={90} />);
    const reset = screen.getByRole('button', { name: t.coverActions.resetRotation });
    expect((reset as HTMLButtonElement).disabled).toBe(false);
    expect(reset.getAttribute('data-rotation-active')).toBe('true');
    fireEvent.click(reset);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ rotation: 0 });
  });

  it('reverts the optimistic rotation when the PATCH fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'rotate failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderWithProviders(<CoverRotationButtons vnId="v90001" />);
    const resetLabelFor = (deg: number) => t.coverActions.rotationDegrees.replace('{rotation}', String(deg));
    expect(screen.getByText(resetLabelFor(0))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.rotateRight }));
    // Optimistic shows 90, then reverts to 0 after the failed request.
    await waitFor(() => expect(screen.getByText(resetLabelFor(0))).toBeTruthy());
  });

  it('syncs rotation from an external cover-changed event for this VN', async () => {
    renderWithProviders(<CoverRotationButtons vnId="v90005" />);
    const label180 = t.coverActions.rotationDegrees.replace('{rotation}', '180');
    act(() => {
      dispatchCoverChanged({ vnId: 'v90005', newSrc: null, newLocal: null, rotation: 180 });
    });
    await waitFor(() => expect(screen.getByText(label180)).toBeTruthy());
  });

  it('ignores cover-changed events for other VNs or without rotation', async () => {
    renderWithProviders(<CoverRotationButtons vnId="v90006" />);
    const label0 = t.coverActions.rotationDegrees.replace('{rotation}', '0');
    const label180 = t.coverActions.rotationDegrees.replace('{rotation}', '180');
    act(() => {
      dispatchCoverChanged({ vnId: 'v90007', newSrc: null, newLocal: null, rotation: 180 });
      dispatchCoverChanged({ vnId: 'v90006', newSrc: null, newLocal: null });
    });
    await waitFor(() => expect(screen.getByText(label0)).toBeTruthy());
    expect(screen.queryByText(label180)).toBeNull();
  });

  it('ignores same-frame duplicate rotation clicks while a PATCH is pending', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    renderWithProviders(<CoverRotationButtons vnId="v90008" />);
    const button = screen.getByRole('button', { name: t.coverActions.rotateRight });
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });

  it('suppresses stale success and failure completions after the VN changes', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const { rerender } = renderWithProviders(<CoverRotationButtons vnId="v90009" />);
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.rotateRight }));
    rerender(<CoverRotationButtons vnId="v90010" />);
    resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await Promise.resolve();
    await Promise.resolve();

    let rejectFetch: (error: Error) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((_resolve, reject) => { rejectFetch = reject; }));
    rerender(<CoverRotationButtons vnId="v90011" />);
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.rotateRight }));
    rerender(<CoverRotationButtons vnId="v90012" />);
    rejectFetch(new Error('stale rotation error'));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('stale rotation error')).toBeNull();
  });
});
