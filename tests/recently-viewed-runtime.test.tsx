// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordRecentlyViewed, useRecentlyViewed } from '@/lib/recentlyViewed';

const STORAGE_KEY = 'vn_recently_viewed_v1';

function RecentConsumer() {
  const { items, clear } = useRecentlyViewed();
  return (
    <div>
      <output data-testid="items">{items.map((item) => item.title).join(',')}</output>
      <button type="button" onClick={clear}>
        clear
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useRecentlyViewed runtime', () => {
  it('synchronizes same-tab and cross-tab changes, ignores unrelated storage events, and removes listeners', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'v90056', title: 'Initial', poster: null, localPoster: null, sexual: 0, viewedAt: 1 },
    ]));
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<RecentConsumer />);
    expect(screen.getByTestId('items')).toHaveTextContent('Initial');

    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'v90057', title: 'Ignored', poster: null, localPoster: null, sexual: 0, viewedAt: 2 },
    ]));
    fireEvent(window, new StorageEvent('storage', { key: 'other' }));
    expect(screen.getByTestId('items')).toHaveTextContent('Initial');

    fireEvent(window, new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(screen.getByTestId('items')).toHaveTextContent('Ignored');

    act(() => {
      recordRecentlyViewed({ id: 'v90058', title: 'Same tab', poster: null, localPoster: null, sexual: 0 });
    });
    expect(screen.getByTestId('items')).toHaveTextContent('Same tab,Ignored');

    fireEvent.click(screen.getByRole('button', { name: 'clear' }));
    expect(screen.getByTestId('items')).toBeEmptyDOMElement();

    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('vn:recently-viewed-updated', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function));
  });
});
