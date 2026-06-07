// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import {
  CardDensitySlider,
  GlobalCardDensitySlider,
  cardGridColumns,
} from '@/components/CardDensitySlider';
import { DisplaySettingsProvider, useDisplaySettings } from '@/lib/settings/client';

let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => searchParamsValue,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** Persist settings the provider rehydrates from after mount. */
function seedSettings(payload: Record<string, unknown>) {
  localStorage.setItem('vn_display_settings_v1', JSON.stringify(payload));
}

/** Probe component surfacing the live settings for assertions. */
function Probe() {
  const { settings } = useDisplaySettings();
  return (
    <output data-testid="probe">
      {JSON.stringify({ density: settings.density, cardDensityPx: settings.cardDensityPx })}
    </output>
  );
}

function readProbe() {
  return JSON.parse(screen.getByTestId('probe').textContent || '{}');
}

beforeEach(() => {
  localStorage.clear();
  searchParamsValue = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('CardDensitySlider (scoped)', () => {
  it('reflects the resolved value and exposes the custom-override chip when scoped', () => {
    seedSettings({ density: { library: 320 } });
    renderWithProviders(
      <DisplaySettingsProvider>
        <CardDensitySlider scope="library" showHint />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '320');
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByText("Resize this section's cards only")).toBeInTheDocument();
  });

  it('writes a denser value through the minus button', async () => {
    seedSettings({ density: { library: 300 } });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <CardDensitySlider scope="library" />
        <Probe />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Denser' }));
    expect(readProbe().density.library).toBe(280);
  });

  it('writes a larger value through the plus button', async () => {
    seedSettings({ density: { library: 300 } });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <CardDensitySlider scope="library" />
        <Probe />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Larger' }));
    expect(readProbe().density.library).toBe(320);
  });

  it('writes the scoped value when the range input changes', () => {
    renderWithProviders(
      <DisplaySettingsProvider>
        <CardDensitySlider scope="library" />
        <Probe />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    fireEvent.change(screen.getByRole('slider'), { target: { value: '160' } });
    expect(readProbe().density.library).toBe(160);
  });

  it('reset clears the scoped override, falling back to the default', async () => {
    seedSettings({ density: { library: 320 } });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <CardDensitySlider scope="library" />
        <Probe />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Reset density' }));
    expect(readProbe().density.library).toBeUndefined();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '220');
  });

  it('disables reset and sets the global default when no scoped override exists at the default value', async () => {
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <CardDensitySlider scope="library" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    const reset = screen.getByRole('button', { name: 'Reset density' });
    expect(reset).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Larger' }));
    expect(reset).toBeEnabled();
  });

  it('resets the global fallback when there is no scoped override but the inherited value is custom', async () => {
    seedSettings({ cardDensityPx: 300, density: {} });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <CardDensitySlider scope="wishlist" />
        <Probe />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '300');
    const reset = screen.getByRole('button', { name: 'Reset density' });
    expect(reset).toBeEnabled();
    await user.click(reset);
    expect(readProbe().cardDensityPx).toBe(220);
  });

  it('lets a URL density override drive the displayed value', () => {
    searchParamsValue = new URLSearchParams('density=400');
    renderWithProviders(
      <DisplaySettingsProvider>
        <CardDensitySlider scope="library" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '400');
  });
});

describe('GlobalCardDensitySlider', () => {
  it('edits the legacy global default through the buttons and range input', async () => {
    seedSettings({ cardDensityPx: 240 });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <GlobalCardDensitySlider />
        <Probe />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '240');
    await user.click(screen.getByRole('button', { name: 'Larger' }));
    expect(readProbe().cardDensityPx).toBe(260);
    await user.click(screen.getByRole('button', { name: 'Denser' }));
    expect(readProbe().cardDensityPx).toBe(240);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '180' } });
    expect(readProbe().cardDensityPx).toBe(180);
  });

  it('resets the global default and disables reset at the default value', async () => {
    seedSettings({ cardDensityPx: 300 });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <GlobalCardDensitySlider />
        <Probe />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Reset density' }));
    expect(readProbe().cardDensityPx).toBe(220);
    expect(screen.getByRole('button', { name: 'Reset density' })).toBeDisabled();
  });
});

describe('cardGridColumns', () => {
  it('clamps the density and builds an auto-fill template by default', () => {
    expect(cardGridColumns(300)).toBe('repeat(auto-fill, minmax(min(100%, 300px), 1fr))');
    expect(cardGridColumns(99999)).toBe('repeat(auto-fill, minmax(min(100%, 480px), 1fr))');
  });

  it('supports an auto-fit fill mode', () => {
    expect(cardGridColumns(220, 'auto-fit')).toBe('repeat(auto-fit, minmax(min(100%, 220px), 1fr))');
  });
});
