// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import {
  IntegrationsSettingsTabSkeleton,
  LayoutSettingsTabSkeleton,
} from '@/components/settings/SettingsTabSkeletons';
import { PAGE_SPACE_SCOPES } from '@/lib/page-space';
import { renderWithProviders } from './helpers/render-component';

describe('settings tab skeletons', () => {
  it('preserves the layout tabs and every per-page configuration row', () => {
    const { container } = renderWithProviders(<LayoutSettingsTabSkeleton />, { locale: 'en' });

    const status = screen.getByRole('status');
    expect(status.hasAttribute('data-settings-layout-skeleton')).toBe(true);
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('[data-settings-layout-rows]')?.children).toHaveLength(PAGE_SPACE_SCOPES.length);
    expect(container.querySelectorAll('[data-settings-layout-rows] li .h-11')).toHaveLength(PAGE_SPACE_SCOPES.length * 4);
  });

  it('preserves credential, proxy, provider, and quote-control geometry', () => {
    const { container } = renderWithProviders(<IntegrationsSettingsTabSkeleton />, { locale: 'en' });

    const status = screen.getByRole('status');
    expect(status.hasAttribute('data-settings-integrations-skeleton')).toBe(true);
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('[data-settings-proxy-sections]')?.children).toHaveLength(4);
    expect(container.querySelectorAll('[data-settings-proxy-sections] .contents')).toHaveLength(20);
  });
});
