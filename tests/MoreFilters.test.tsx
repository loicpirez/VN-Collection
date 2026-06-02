// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { MoreFilters, type FilterKey } from '@/components/library/MoreFilters';
import { useT } from '@/lib/i18n/client';

afterEach(() => {
  cleanup();
});

const ALL_OFF: Record<FilterKey, string | null> = {
  match_vndb: null,
  match_egs: null,
  only_egs_only: null,
  fan_disc: null,
  has_notes: null,
  has_custom_cover: null,
  has_banner: null,
  is_favorite: null,
  has_released: null,
  is_nsfw: null,
  is_nukige: null,
  in_reading_queue: null,
  in_list: null,
};

/**
 * MoreFilters takes the localized dictionary as a prop, so render it
 * through a consumer that reads the live `useT()` from the providers.
 */
function Harness({
  values,
  onCycle = vi.fn(),
  onReset = vi.fn(),
}: {
  values: Record<FilterKey, string | null>;
  onCycle?: (key: FilterKey) => void;
  onReset?: () => void;
}) {
  const t = useT();
  return <MoreFilters values={values} onCycle={onCycle} onReset={onReset} t={t} />;
}

describe('MoreFilters', () => {
  it('renders every flag button with no active count and no reset when all are off', () => {
    renderWithProviders(<Harness values={ALL_OFF} />, { locale: 'en' });
    expect(screen.getByText('Boolean flags')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Has VNDB entry/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Reset all advanced filters' })).not.toBeInTheDocument();
  });

  it('reflects yes / no tri-state via aria-pressed and shows the active count + reset', () => {
    renderWithProviders(
      <Harness values={{ ...ALL_OFF, is_favorite: '1', has_notes: '0' }} />,
      { locale: 'en' },
    );
    expect(screen.getByRole('button', { name: /Favorite/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Has notes/ })).toHaveAttribute('aria-pressed', 'mixed');
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset all advanced filters' })).toBeInTheDocument();
  });

  it('invokes onCycle with the flag key when a chip is clicked', async () => {
    const onCycle = vi.fn();
    const { user } = renderWithProviders(
      <Harness values={ALL_OFF} onCycle={onCycle} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: /Fan disc/ }));
    expect(onCycle).toHaveBeenCalledWith('fan_disc');
  });

  it('invokes onReset from the reset-all control', async () => {
    const onReset = vi.fn();
    const { user } = renderWithProviders(
      <Harness values={{ ...ALL_OFF, is_nukige: '1' }} onReset={onReset} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Reset all advanced filters' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
