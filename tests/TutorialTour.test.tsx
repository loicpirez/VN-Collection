// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTour, TutorialTour } from '@/components/TutorialTour';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  pathname: '/',
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({ push: navigationMocks.push }),
}));

const t = dictionaries.en;
const STORAGE_KEY = 'vn_tour_completed_v1';

function advance(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}

beforeEach(() => {
  vi.useFakeTimers();
  navigationMocks.pathname = '/';
  navigationMocks.push.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TutorialTour', () => {
  it('does not auto-open deep links and can be manually restarted and closed', () => {
    navigationMocks.pathname = '/stats';
    renderWithProviders(<TutorialTour />, { locale: 'en' });
    advance(800);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => startTour());
    expect(navigationMocks.push).toHaveBeenCalledWith('/');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('dialog')).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: t.common.close }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('auto-opens the library tour and progresses through every route before finishing', () => {
    renderWithProviders(<TutorialTour />, { locale: 'en' });
    advance(799);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    advance(1);
    expect(screen.getByRole('dialog')).toHaveFocus();
    expect(navigationMocks.push).toHaveBeenCalledWith('/');

    const expectedRoutes = [
      '/search',
      '/lists',
      '/recommendations',
      '/upcoming',
      '/quotes',
      `/year?y=${new Date().getFullYear()}`,
      '/stats',
      '/shelf',
      '/shelf?view=layout',
      '/steam',
      '/egs',
      '/dumped',
      '/data',
    ];
    for (const route of expectedRoutes) {
      fireEvent.click(screen.getByRole('button', { name: t.tour.next }));
      expect(navigationMocks.push).toHaveBeenLastCalledWith(route);
      expect(screen.getByRole('dialog')).toHaveFocus();
    }

    fireEvent.click(screen.getByRole('button', { name: t.tour.finish }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('respects persisted completion and closes from Escape or Skip', () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    const { rerender } = renderWithProviders(<TutorialTour />, { locale: 'en' });
    advance(800);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => window.dispatchEvent(new Event('vn-tour:start')));
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');

    rerender(<TutorialTour />);
    act(() => window.dispatchEvent(new Event('vn-tour:start')));
    fireEvent.click(screen.getByRole('button', { name: t.tour.skip }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
