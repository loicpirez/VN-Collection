// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SteamLinksSectionSkeleton,
  SteamPageSkeleton,
  SteamSuggestionsSkeleton,
  SteamUnlinkedRowsSkeleton,
} from '@/components/SteamPageSkeleton';
import { renderWithProviders } from './helpers/render-component';

afterEach(cleanup);

describe('SteamPageSkeleton', () => {
  it('preserves the complete three-workflow route geometry', () => {
    const { container } = renderWithProviders(<SteamPageSkeleton label="Loading Steam" />);

    expect(screen.getAllByText('Loading Steam').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-steam-header-skeleton]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-steam-suggestions-skeleton] > ul > li')).toHaveLength(5);
    expect(container.querySelectorAll('[data-steam-section-skeleton="links"] li')).toHaveLength(6);
    expect(container.querySelectorAll('[data-steam-unlinked-skeleton] > li:not(.sr-only)')).toHaveLength(5);
  });

  it('supports each independently pending data section', () => {
    const { container } = renderWithProviders(
      <>
        <SteamSuggestionsSkeleton label="Loading suggestions" />
        <SteamLinksSectionSkeleton label="Loading links" />
        <SteamUnlinkedRowsSkeleton label="Loading games" />
      </>,
    );

    expect(screen.getByText('Loading suggestions')).toBeInTheDocument();
    expect(screen.getByText('Loading links')).toBeInTheDocument();
    expect(screen.getByText('Loading games')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-steam-section-skeleton="links"] .h-11.w-11')).toHaveLength(6);
    expect(container.querySelectorAll('[data-steam-unlinked-skeleton] .h-11.flex-1')).toHaveLength(5);
  });
});
