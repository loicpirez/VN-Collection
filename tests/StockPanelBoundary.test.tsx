// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { StockPanelBoundary } from '@/components/StockPanelBoundary';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** Child that throws on the first render, then renders cleanly after reset. */
let shouldThrow = true;
function MaybeThrow() {
  if (shouldThrow) throw new Error('boom from child');
  return <div data-testid="happy-child">all good</div>;
}

/** Wrapper that lets a test flip a child between healthy and throwing. */
function Toggleable() {
  const [throwing, setThrowing] = useState(true);
  return (
    <div>
      <button type="button" onClick={() => setThrowing((v) => !v)}>
        flip
      </button>
      <StockPanelBoundary title="Stock" fallbackMessage="It broke" retryLabel="Retry now">
        {throwing ? <Thrower /> : <div data-testid="recovered">recovered</div>}
      </StockPanelBoundary>
    </div>
  );
}

function Thrower(): never {
  throw new Error('render failure');
}

describe('StockPanelBoundary', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    shouldThrow = true;
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('renders children unchanged when no error is thrown', () => {
    const { container } = renderWithProviders(
      <StockPanelBoundary title="Stock" fallbackMessage="msg" retryLabel="Retry">
        <p data-testid="child">healthy</p>
      </StockPanelBoundary>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('catches a thrown child and shows the fallback heading, message, and retry button', () => {
    renderWithProviders(
      <StockPanelBoundary title="Stock panel" fallbackMessage="The panel crashed" retryLabel="Retry now">
        <Thrower />
      </StockPanelBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(screen.getByText('Stock panel')).toBeTruthy();
    expect(screen.getByText('The panel crashed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeTruthy();
    // componentDidCatch logged to console (window is defined under jsdom).
    expect(errorSpy).toHaveBeenCalled();
  });

  it('reset clears the error; once the child stops throwing the children render again', () => {
    renderWithProviders(<Toggleable />);
    // Initially the boundary caught the throwing child.
    expect(screen.getByRole('alert')).toBeTruthy();
    // Flip the child to a healthy element BEFORE resetting so the re-render succeeds.
    fireEvent.click(screen.getByRole('button', { name: 'flip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(screen.getByTestId('recovered')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('re-throws into the fallback again if reset happens while the child still throws', () => {
    renderWithProviders(
      <StockPanelBoundary title="Stock" fallbackMessage="broke" retryLabel="Retry">
        <Thrower />
      </StockPanelBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    // Child still throws on the re-render, so the fallback is shown again.
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
