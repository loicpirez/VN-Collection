// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';
import { DisplaySettingsProvider } from '@/lib/settings/client';

let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => searchParamsValue,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** Persist a per-scope density so the provider's hydration effect keeps it. */
function seedScopedDensity(scope: string, px: number) {
  localStorage.setItem('vn_display_settings_v1', JSON.stringify({ density: { [scope]: px } }));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  searchParamsValue = new URLSearchParams();
});

describe('DensityScopeProvider', () => {
  it('renders children inside a div with the scoped density variable from settings', () => {
    seedScopedDensity('library', 300);
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <DensityScopeProvider scope="library">
          <span>child-content</span>
        </DensityScopeProvider>
      </DisplaySettingsProvider>,
    );
    expect(screen.getByText('child-content')).toBeInTheDocument();
    const wrapper = container.querySelector('div[style]') as HTMLElement;
    expect(wrapper.tagName).toBe('DIV');
    expect(wrapper.style.getPropertyValue('--card-density-px')).toBe('300px');
  });

  it('lets a URL density override beat the scoped setting', () => {
    seedScopedDensity('library', 300);
    searchParamsValue = new URLSearchParams('density=160');
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <DensityScopeProvider scope="library">
          <span>child</span>
        </DensityScopeProvider>
      </DisplaySettingsProvider>,
    );
    const wrapper = container.querySelector('div[style]') as HTMLElement;
    expect(wrapper.style.getPropertyValue('--card-density-px')).toBe('160px');
  });

  it('honors the `as` prop to pick the wrapper element and forwards className', () => {
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <DensityScopeProvider scope="search" as="section" className="my-frame">
          <span>section-child</span>
        </DensityScopeProvider>
      </DisplaySettingsProvider>,
    );
    const section = container.querySelector('section');
    expect(section).not.toBeNull();
    expect(section).toHaveClass('my-frame');
    expect((section as HTMLElement).style.getPropertyValue('--card-density-px')).toBe('220px');
  });
});
