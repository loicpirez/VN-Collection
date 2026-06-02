// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from '@/components/ToastProvider';
import { I18nProvider } from '@/lib/i18n/client';
import { dictionaries } from '@/lib/i18n/dictionaries';

function ToastControls() {
  const toast = useToast();
  return (
    <div>
      <button type="button" onClick={() => toast.success('Saved')}>
        success
      </button>
      <button type="button" onClick={() => toast.error('Failed')}>
        error
      </button>
      <button type="button" onClick={() => toast.info('Information', 0)}>
        info
      </button>
      <button type="button" onClick={() => toast.warning('Warning', 0)}>
        warning
      </button>
      <button type="button" onClick={() => toast.push('info', 'Custom', 25)}>
        custom
      </button>
    </div>
  );
}

function MissingToastProvider() {
  useToast();
  return null;
}

function renderToastControls() {
  return render(
    <I18nProvider locale="en" dict={dictionaries.en}>
      <ToastProvider>
        <ToastControls />
      </ToastProvider>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ToastProvider runtime', () => {
  it('rejects useToast consumers outside the provider', () => {
    expect(() => render(<MissingToastProvider />)).toThrow('useToast must be used inside <ToastProvider>');
  });

  it('renders every tone and supports manual and timed dismissal', () => {
    vi.useFakeTimers();
    renderToastControls();

    fireEvent.click(screen.getByRole('button', { name: 'success' }));
    fireEvent.click(screen.getByRole('button', { name: 'error' }));
    fireEvent.click(screen.getByRole('button', { name: 'info' }));
    fireEvent.click(screen.getByRole('button', { name: 'warning' }));
    fireEvent.click(screen.getByRole('button', { name: 'custom' }));

    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    expect(screen.getAllByRole('status')).toHaveLength(4);

    const dismissButtons = screen.getAllByRole('button', { name: dictionaries.en.common.dismiss });
    fireEvent.click(dismissButtons[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: dictionaries.en.common.dismiss })[1]!);

    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.queryByText('Information')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(25);
    });
    expect(screen.queryByText('Custom')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByText('Failed')).toBeNull();
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('clears pending timers when the provider unmounts', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = renderToastControls();
    fireEvent.click(screen.getByRole('button', { name: 'custom' }));
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
