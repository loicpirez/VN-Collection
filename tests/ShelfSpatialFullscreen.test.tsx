// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { ShelfSpatialFullscreen } from '@/components/ShelfSpatialFullscreen';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/shelf',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const labels = { enterFullscreen: 'Enter fullscreen', exitFullscreen: 'Exit fullscreen' };

describe('ShelfSpatialFullscreen', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders children and a fullscreen toggle in normal mode', () => {
    renderWithProviders(
      <ShelfSpatialFullscreen labels={labels} prevHref="/shelf?shelf=1" nextHref="/shelf?shelf=3">
        <div data-testid="shelf-body">shelf grid</div>
      </ShelfSpatialFullscreen>,
    );
    expect(screen.getByTestId('shelf-body')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: 'Enter fullscreen' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    // Not a dialog while closed.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('enters fullscreen, exposing a dialog and locking body scroll', () => {
    renderWithProviders(
      <ShelfSpatialFullscreen labels={labels} prevHref={null} nextHref={null}>
        <div>shelf grid</div>
      </ShelfSpatialFullscreen>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');
    // The button now exits.
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy();
  });

  it('exits fullscreen via the toggle and restores body scroll', () => {
    renderWithProviders(
      <ShelfSpatialFullscreen labels={labels} prevHref={null} nextHref={null}>
        <div>shelf grid</div>
      </ShelfSpatialFullscreen>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('exits fullscreen on Escape', () => {
    renderWithProviders(
      <ShelfSpatialFullscreen labels={labels} prevHref={null} nextHref={null}>
        <div>shelf grid</div>
      </ShelfSpatialFullscreen>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the controls slot only inside fullscreen', () => {
    renderWithProviders(
      <ShelfSpatialFullscreen
        labels={labels}
        prevHref={null}
        nextHref={null}
        controlsSlot={<button type="button">slot-control</button>}
      >
        <div>shelf grid</div>
      </ShelfSpatialFullscreen>,
    );
    expect(screen.queryByRole('button', { name: 'slot-control' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(screen.getByRole('button', { name: 'slot-control' })).toBeTruthy();
  });

  it('navigates to nextHref on ArrowRight while fullscreen is open', () => {
    renderWithProviders(
      <ShelfSpatialFullscreen labels={labels} prevHref="/shelf?shelf=1" nextHref="/shelf?shelf=3">
        <div>shelf grid</div>
      </ShelfSpatialFullscreen>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(pushMock).toHaveBeenCalledWith('/shelf?shelf=3');
  });

  it('navigates to prevHref on ArrowUp / PageUp while fullscreen is open', () => {
    renderWithProviders(
      <ShelfSpatialFullscreen labels={labels} prevHref="/shelf?shelf=1" nextHref="/shelf?shelf=3">
        <div>shelf grid</div>
      </ShelfSpatialFullscreen>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    fireEvent.keyDown(window, { key: 'PageUp' });
    expect(pushMock).toHaveBeenCalledWith('/shelf?shelf=1');
  });

  it('does not navigate on arrow keys when not fullscreen and container is unfocused', () => {
    renderWithProviders(
      <ShelfSpatialFullscreen labels={labels} prevHref="/shelf?shelf=1" nextHref="/shelf?shelf=3">
        <div>shelf grid</div>
      </ShelfSpatialFullscreen>,
    );
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('ignores arrow keys when the event target is a text input', () => {
    renderWithProviders(
      <ShelfSpatialFullscreen labels={labels} prevHref="/shelf?shelf=1" nextHref="/shelf?shelf=3">
        <input aria-label="filter" />
      </ShelfSpatialFullscreen>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    const input = screen.getByLabelText('filter');
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('does not navigate past an absent neighbor', () => {
    renderWithProviders(
      <ShelfSpatialFullscreen labels={labels} prevHref={null} nextHref={null}>
        <div>shelf grid</div>
      </ShelfSpatialFullscreen>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(pushMock).not.toHaveBeenCalled();
  });
});
