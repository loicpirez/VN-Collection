// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SearchEgsRowsSkeleton,
  SearchLocalPanelSkeleton,
  SearchPageSkeleton,
  SearchVndbResultsSkeleton,
} from '@/components/SearchPageSkeleton';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { renderWithProviders } from './helpers/render-component';

afterEach(cleanup);

describe('SearchPageSkeleton', () => {
  it('preserves the guaranteed source, query, and filter geometry without results', () => {
    const { container } = renderWithProviders(
      <DisplaySettingsProvider initial={{ density: { search: 220 } }}>
        <SearchPageSkeleton label="Loading search" />
      </DisplaySettingsProvider>,
    );

    expect(screen.getAllByText('Loading search').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-search-page-skeleton="true"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-search-page-skeleton="true"] .h-11')).toHaveLength(5);
    expect(container.querySelector('[data-search-vndb-results-skeleton]')).toBeNull();
  });

  it('matches each result-source body without unrelated artwork', () => {
    const { container } = renderWithProviders(
      <>
        <SearchVndbResultsSkeleton />
        <SearchEgsRowsSkeleton label="Loading EGS" />
        <SearchLocalPanelSkeleton label="Loading local" />
      </>,
    );

    expect(screen.getByText('Loading EGS')).toBeInTheDocument();
    expect(screen.getByText('Loading local')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-search-egs-rows-skeleton] > li:not(.sr-only)')).toHaveLength(6);
    expect(container.querySelectorAll('[data-search-local-panel-skeleton] li')).toHaveLength(3);
    const vndbRoot = container.querySelector('[data-search-vndb-results-skeleton]');
    expect(Array.from(vndbRoot?.querySelectorAll('[aria-hidden]') ?? []).filter((node) => node.classList.contains('aspect-[2/3]'))).toHaveLength(18);
    const egsRoot = container.querySelector('[data-search-egs-rows-skeleton]');
    expect(Array.from(egsRoot?.querySelectorAll('[aria-hidden]') ?? []).some((node) => node.classList.contains('aspect-[2/3]'))).toBe(false);
  });

  it('supports module fallbacks before a localized announcement is available', () => {
    const { container } = renderWithProviders(
      <>
        <SearchEgsRowsSkeleton />
        <SearchLocalPanelSkeleton />
      </>,
    );

    expect(container.querySelector('[data-search-egs-rows-skeleton] > .sr-only')).toBeNull();
    expect(container.querySelector('[data-search-local-panel-skeleton] > .sr-only')).toBeNull();
  });
});
