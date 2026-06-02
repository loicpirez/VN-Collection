// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { RecommendModeTabs, type ModeTabItem } from '@/components/RecommendModeTabs';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function tabs(activeId: string): ModeTabItem[] {
  return [
    { id: 'foryou', href: '/recommendations?mode=for-you', label: 'For You', hint: 'hint a', iconId: 'heart', active: activeId === 'foryou' },
    { id: 'tags', href: '/recommendations?mode=tag', label: 'By Tag', hint: 'hint b', iconId: 'tag', active: activeId === 'tags' },
    { id: 'gems', href: '/recommendations?mode=gems', label: 'Gems', hint: 'hint c', iconId: 'gem', active: activeId === 'gems' },
    { id: 'top', href: '/recommendations?mode=top', label: 'Top', hint: 'hint d', iconId: 'award', active: activeId === 'top' },
    { id: 'similar', href: '/recommendations?mode=similar', label: 'Similar', hint: 'hint e', iconId: 'compass', active: activeId === 'similar' },
  ];
}

describe('RecommendModeTabs', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders one button per tab inside a labelled nav', () => {
    renderWithProviders(<RecommendModeTabs tabs={tabs('foryou')} ariaLabel="Recommendation modes" />);
    const nav = screen.getByRole('navigation', { name: 'Recommendation modes' });
    expect(nav).toBeTruthy();
    expect(nav.getAttribute('aria-busy')).toBe('false');
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('marks the active tab with aria-current=page and leaves others unset', () => {
    renderWithProviders(<RecommendModeTabs tabs={tabs('tags')} ariaLabel="modes" />);
    const active = screen.getByRole('button', { name: 'By Tag' });
    expect(active.getAttribute('aria-current')).toBe('page');
    const inactive = screen.getByRole('button', { name: 'For You' });
    expect(inactive.getAttribute('aria-current')).toBeNull();
  });

  it('navigates when clicking an inactive tab', () => {
    renderWithProviders(<RecommendModeTabs tabs={tabs('foryou')} ariaLabel="modes" />);
    fireEvent.click(screen.getByRole('button', { name: 'Gems' }));
    expect(pushMock).toHaveBeenCalledWith('/recommendations?mode=gems');
  });

  it('does not navigate when clicking the already-active tab', () => {
    renderWithProviders(<RecommendModeTabs tabs={tabs('foryou')} ariaLabel="modes" />);
    fireEvent.click(screen.getByRole('button', { name: 'For You' }));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('renders a button for every icon id mapping without throwing', () => {
    renderWithProviders(<RecommendModeTabs tabs={tabs('similar')} ariaLabel="modes" />);
    expect(screen.getByRole('button', { name: 'Similar' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Top' })).toBeTruthy();
  });
});
