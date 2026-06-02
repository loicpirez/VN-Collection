// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { TrackingFields } from '@/components/edit-form/TrackingFields';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

function baseProps() {
  return {
    status: 'playing' as const,
    onStatusChange: vi.fn(),
    userRating: '80',
    userRatingInvalid: false,
    onUserRatingChange: vi.fn(),
    playtime: '120',
    playtimeInvalid: false,
    onPlaytimeChange: vi.fn(),
    favorite: false,
    onFavoriteChange: vi.fn(),
    started: '2024-01-01',
    onStartedChange: vi.fn(),
    finished: '',
    onFinishedChange: vi.fn(),
  };
}

describe('TrackingFields', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders heading, auto-save badge and the status select reflecting the value', () => {
    renderWithProviders(<TrackingFields {...baseProps()} />);
    expect(screen.getByText(t.form.myTracking)).toBeTruthy();
    expect(screen.getByText(t.form.autoSaveBadge)).toBeTruthy();
    const status = screen.getByDisplayValue(t.status.playing) as HTMLSelectElement;
    expect(status.value).toBe('playing');
  });

  it('fires the right handlers for status / rating / playtime / favorite changes', () => {
    const props = baseProps();
    renderWithProviders(<TrackingFields {...props} />);
    fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'completed' } });
    expect(props.onStatusChange).toHaveBeenCalledWith('completed');

    fireEvent.change(screen.getByDisplayValue('80'), { target: { value: '90' } });
    expect(props.onUserRatingChange).toHaveBeenCalledWith('90');

    fireEvent.change(screen.getByDisplayValue('120'), { target: { value: '200' } });
    expect(props.onPlaytimeChange).toHaveBeenCalledWith('200');

    const favorite = screen.getByDisplayValue(t.common.no) as HTMLSelectElement;
    fireEvent.change(favorite, { target: { value: '1' } });
    expect(props.onFavoriteChange).toHaveBeenCalledWith(true);
  });

  it('renders validation error nodes when rating and playtime are invalid', () => {
    renderWithProviders(
      <TrackingFields {...baseProps()} userRating="5" userRatingInvalid playtime="-1" playtimeInvalid />,
    );
    expect(screen.getByText(t.form.errors.ratingRange)).toBeTruthy();
    expect(screen.getByText(t.form.errors.playtimeInvalid)).toBeTruthy();
    const rating = screen.getByDisplayValue('5');
    expect(rating.getAttribute('aria-invalid')).toBe('true');
    expect(rating.getAttribute('aria-describedby')).toBe('edit-rating-error');
  });

  it('shows favorite as Yes when favorite=true', () => {
    renderWithProviders(<TrackingFields {...baseProps()} favorite />);
    const favorite = screen.getByDisplayValue(t.form.favoriteYes) as HTMLSelectElement;
    expect(favorite.value).toBe('1');
  });
});
