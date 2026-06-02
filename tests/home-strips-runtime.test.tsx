// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReadingQueueStrip } from '@/components/ReadingQueueStrip';
import { RecentlyViewedStrip } from '@/components/RecentlyViewedStrip';
import { listReadingQueue } from '@/lib/db';
import { getReadingSpeedProfile, predictReadingMinutes } from '@/lib/reading-speed';
import { useRecentlyViewed } from '@/lib/recentlyViewed';
import { useHomeSection } from '@/components/HomeSectionMenu';
import type { RecentEntry } from '@/lib/recentlyViewed';
import { renderWithProviders } from './helpers/render-component';

const mocks = vi.hoisted(() => ({
  all: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    prepare: vi.fn(() => ({ all: mocks.all })),
  },
  listReadingQueue: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => ({
    common: { error: 'Error' },
    lists: { reorderHint: 'Reorder', reorderKeyboardHint: 'Keyboard reorder' },
    readingQueue: { title: 'Reading queue' },
    readingSpeed: { you: 'You' },
    year: { hoursUnit: 'h', minutesUnit: 'm' },
  })),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/lib/reading-speed', () => ({
  getReadingSpeedProfile: vi.fn(),
  predictReadingMinutes: vi.fn(),
}));

vi.mock('@/components/ReadingQueueStripView', () => ({
  ReadingQueueStripView: ({ entries, title }: { entries: Array<{ vn_id: string; predictedMinutes: number | null }>; title: string }) => (
    <div data-testid="reading-queue" data-count={entries.length} data-first={entries[0]?.vn_id} data-minutes={entries[0]?.predictedMinutes ?? ''}>
      {title}
    </div>
  ),
}));

vi.mock('@/lib/recentlyViewed', () => ({
  useRecentlyViewed: vi.fn(),
}));

vi.mock('@/components/HomeSectionMenu', () => ({
  HomeSectionControls: ({ onClearData }: { onClearData?: () => void }) => <button type="button" onClick={onClearData}>Controls</button>,
  useHomeSection: vi.fn(),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('@/components/ScrollFadeRight', () => ({
  ScrollFadeRight: ({ children }: { children: React.ReactNode }) => <div data-testid="scroll">{children}</div>,
}));

const recent: RecentEntry = {
  id: 'v90001',
  title: 'Recent VN',
  poster: '/remote.jpg',
  localPoster: null,
  sexual: null,
  viewedAt: 1,
};

beforeEach(() => {
  vi.mocked(listReadingQueue).mockReset().mockReturnValue([]);
  vi.mocked(getReadingSpeedProfile).mockReset().mockReturnValue({
    sampleSize: 0,
    multiplierVsVndb: null,
    multiplierVsEgs: null,
    medianMyMinutes: null,
  });
  vi.mocked(predictReadingMinutes).mockReset().mockReturnValue(321);
  mocks.all.mockReset().mockImplementation((...ids: string[]) => ids.map((id) => ({
    id,
    title: `Title ${id}`,
    image_thumb: null,
    image_url: null,
    local_image_thumb: null,
    image_sexual: null,
    length_minutes: 600,
    egs_minutes: null,
  })));
  vi.mocked(useRecentlyViewed).mockReset().mockReturnValue({ items: [], clear: vi.fn() });
  vi.mocked(useHomeSection).mockReset().mockReturnValue({
    state: { visible: true, collapsed: false },
    busy: false,
    isHidden: false,
    isCollapsed: false,
    toggleCollapsed: vi.fn(),
    hide: vi.fn(),
    persist: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});

describe('ReadingQueueStrip server wrapper', () => {
  it('does not render an empty queue', async () => {
    expect(await ReadingQueueStrip({})).toBeNull();
  });

  it('chunks DB lookups, skips missing rows, and maps reading predictions', async () => {
    const queue = Array.from({ length: 501 }, (_unused, index) => ({
      vn_id: `v${90000 + index}`,
      position: index + 1,
      added_at: index,
    }));
    vi.mocked(listReadingQueue).mockReturnValue(queue);
    mocks.all.mockImplementation((...ids: string[]) => ids
      .filter((id) => id !== 'v90001')
      .map((id) => ({
        id,
        title: `Title ${id}`,
        image_thumb: null,
        image_url: null,
        local_image_thumb: null,
        image_sexual: null,
        length_minutes: 600,
        egs_minutes: null,
      })));
    const html = renderToStaticMarkup(await ReadingQueueStrip({}));
    expect(mocks.all).toHaveBeenCalledTimes(2);
    expect(html).toContain('data-count="500"');
    expect(html).toContain('data-first="v90000"');
    expect(html).toContain('data-minutes="321"');
    expect(predictReadingMinutes).toHaveBeenCalledWith(600, null, expect.any(Object));
  });
});

describe('RecentlyViewedStrip client wrapper', () => {
  it('does not render hidden or empty strips', () => {
    vi.mocked(useHomeSection).mockReturnValueOnce({
      state: { visible: false, collapsed: false },
      busy: false,
      isHidden: true,
      isCollapsed: false,
      toggleCollapsed: vi.fn(),
      hide: vi.fn(),
      persist: vi.fn(),
    });
    const { rerender } = renderWithProviders(<RecentlyViewedStrip />);
    expect(document.body.textContent).toBe('');
    rerender(<RecentlyViewedStrip />);
    expect(document.body.textContent).toBe('');
  });

  it('renders collapsed and expanded rows and delegates clear', () => {
    const clear = vi.fn();
    vi.mocked(useRecentlyViewed).mockReturnValue({ items: [recent], clear });
    vi.mocked(useHomeSection).mockReturnValueOnce({
      state: { visible: true, collapsed: true },
      busy: false,
      isHidden: false,
      isCollapsed: true,
      toggleCollapsed: vi.fn(),
      hide: vi.fn(),
      persist: vi.fn(),
    });
    const { rerender } = renderWithProviders(<RecentlyViewedStrip />);
    expect(screen.queryByTestId('scroll')).toBeNull();
    screen.getByRole('button', { name: 'Controls' }).click();
    expect(clear).toHaveBeenCalledTimes(1);

    rerender(<RecentlyViewedStrip />);
    expect(screen.getByRole('link', { name: /^Recent VN/ })).toHaveAttribute('href', '/vn/v90001');
    expect(screen.getByRole('img', { name: 'Recent VN' })).toBeInTheDocument();
  });
});
