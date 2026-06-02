// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { CardDensityVarSetter } from '@/components/CardDensityVarSetter';
import { DisplaySettingsProvider } from '@/lib/settings/client';

/**
 * Seed the persisted settings the provider reads back in its post-mount
 * hydration effect. The `initial` prop alone is overwritten by that
 * effect, so localStorage is the durable seed in jsdom. cardDensityPx
 * is also written through `density.library` so the legacy migration
 * (which lifts cardDensityPx → density.library when they differ from
 * the default) never silently rewrites the value under test.
 */
function seedDensity(px: number) {
  localStorage.setItem(
    'vn_display_settings_v1',
    JSON.stringify({ cardDensityPx: px, density: { library: px } }),
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.style.removeProperty('--card-density-px');
});

describe('CardDensityVarSetter', () => {
  it('writes the default density to the document root and renders no DOM', () => {
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <CardDensityVarSetter />
      </DisplaySettingsProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(document.documentElement.style.getPropertyValue('--card-density-px')).toBe('220px');
  });

  it('clamps an out-of-range persisted value before writing the CSS variable', () => {
    seedDensity(99999);
    renderWithProviders(
      <DisplaySettingsProvider>
        <CardDensityVarSetter />
      </DisplaySettingsProvider>,
    );
    expect(document.documentElement.style.getPropertyValue('--card-density-px')).toBe('480px');
  });

  it('mirrors an explicit in-range persisted value', () => {
    seedDensity(300);
    renderWithProviders(
      <DisplaySettingsProvider>
        <CardDensityVarSetter />
      </DisplaySettingsProvider>,
    );
    expect(document.documentElement.style.getPropertyValue('--card-density-px')).toBe('300px');
  });
});
