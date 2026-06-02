// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordRecentView } from '@/components/RecordRecentView';
import { recordRecentlyViewed } from '@/lib/recentlyViewed';

vi.mock('@/lib/recentlyViewed', () => ({
  recordRecentlyViewed: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.mocked(recordRecentlyViewed).mockReset();
});

describe('RecordRecentView', () => {
  it('records the mounted VN and refreshes the entry when its props change', () => {
    const { container, rerender } = render(
      <RecordRecentView id="v90001" title="First" poster={null} localPoster="first.jpg" sexual={0} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(recordRecentlyViewed).toHaveBeenCalledWith({
      id: 'v90001',
      title: 'First',
      poster: null,
      localPoster: 'first.jpg',
      sexual: 0,
    });

    rerender(<RecordRecentView id="v90002" title="Second" poster="second.jpg" localPoster={null} sexual={null} />);
    expect(recordRecentlyViewed).toHaveBeenLastCalledWith({
      id: 'v90002',
      title: 'Second',
      poster: 'second.jpg',
      localPoster: null,
      sexual: null,
    });
    expect(recordRecentlyViewed).toHaveBeenCalledTimes(2);
  });
});
