// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { ResetViewDefaultsButton } from '@/components/ResetViewDefaultsButton';
import { DisplaySettingsProvider, useDisplaySettings } from '@/lib/settings/client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** Persist a density map the provider rehydrates from after mount. */
function seedDensity(density: Record<string, number>) {
  localStorage.setItem('vn_display_settings_v1', JSON.stringify({ density }));
}

/** Probe component that surfaces the live density map for assertions. */
function DensityProbe() {
  const { settings } = useDisplaySettings();
  return <output data-testid="density">{JSON.stringify(settings.density)}</output>;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('ResetViewDefaultsButton', () => {
  it('renders the reset label and applies the optional className', () => {
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <ResetViewDefaultsButton scope="library" className="extra-class" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    const button = screen.getByRole('button', { name: 'Reset view' });
    expect(button).toBeInTheDocument();
    expect(container.querySelector('button')).toHaveClass('extra-class');
  });

  it('clears only the scoped density override and invokes the URL-clear callback', async () => {
    seedDensity({ library: 300, search: 180 });
    const onClear = vi.fn();
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <ResetViewDefaultsButton scope="library" onClearUrlState={onClear} />
        <DensityProbe />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Reset view' }));
    const parsed = JSON.parse(screen.getByTestId('density').textContent || '{}');
    expect(parsed.library).toBeUndefined();
    expect(parsed.search).toBe(180);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('still fires the callback when the scope has no override to clear', async () => {
    const onClear = vi.fn();
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <ResetViewDefaultsButton scope="library" onClearUrlState={onClear} />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('does not throw when no callback is supplied', async () => {
    seedDensity({ library: 300 });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <ResetViewDefaultsButton scope="library" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument();
  });
});
