// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DisplaySettingsProvider, useDisplaySettings } from '@/lib/settings/client';

const STORAGE_KEY = 'vn_display_settings_v1';
const MIGRATION_KEY = 'vn_display_settings_legacy_library_seeded_v1';

function SettingsProbe() {
  const { settings, set, reset } = useDisplaySettings();
  return (
    <div>
      <output data-testid="hidden">{String(settings.hideImages)}</output>
      <output data-testid="library-density">{String(settings.density.library ?? '')}</output>
      <output data-testid="mobile-return">{String(settings.showVnMobileLibraryLink)}</output>
      <button type="button" onClick={() => set('hideImages', true)}>
        hide
      </button>
      <button type="button" onClick={reset}>
        reset
      </button>
      <button type="button" onClick={() => set('showVnMobileLibraryLink', false)}>
        hide mobile return
      </button>
    </div>
  );
}

function MissingSettingsProvider() {
  useDisplaySettings();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.vnMobileLibraryReturn;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.vnMobileLibraryReturn;
});

describe('DisplaySettingsProvider runtime', () => {
  it('rejects settings consumers outside the provider', () => {
    expect(() => render(<MissingSettingsProvider />)).toThrow('useDisplaySettings must be used within DisplaySettingsProvider');
  });

  it('supports live mutation and reset through the provider API', () => {
    render(
      <DisplaySettingsProvider>
        <SettingsProbe />
      </DisplaySettingsProvider>,
    );
    expect(screen.getByTestId('hidden')).toHaveTextContent('false');
    fireEvent.click(screen.getByRole('button', { name: 'hide' }));
    expect(screen.getByTestId('hidden')).toHaveTextContent('true');
    fireEvent.click(screen.getByRole('button', { name: 'reset' }));
    expect(screen.getByTestId('hidden')).toHaveTextContent('false');
    expect(document.documentElement.dataset.vnMobileLibraryReturn).toBe('visible');
    fireEvent.click(screen.getByRole('button', { name: 'hide mobile return' }));
    expect(screen.getByTestId('mobile-return')).toHaveTextContent('false');
    expect(document.documentElement.dataset.vnMobileLibraryReturn).toBe('hidden');
  });

  it('seeds and marks a legacy library-density migration during hydration', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cardDensityPx: 300 }));
    render(
      <DisplaySettingsProvider>
        <SettingsProbe />
      </DisplaySettingsProvider>,
    );
    expect(screen.getByTestId('library-density')).toHaveTextContent('300');
    expect(localStorage.getItem(MIGRATION_KEY)).toBe('1');
  });
});
