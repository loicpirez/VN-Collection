// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CharacterCardsSkeleton,
  QuoteRowsSkeleton,
  ReleaseRowsSkeleton,
  RouteRowsSkeleton,
} from '@/components/VnSectionSkeletons';
import { renderWithProviders } from './helpers/render-component';

afterEach(cleanup);

describe('VN section skeleton geometry', () => {
  it('matches character portraits and quote citation avatars', () => {
    const { container } = renderWithProviders(
      <>
        <CharacterCardsSkeleton />
        <QuoteRowsSkeleton />
      </>,
      { locale: 'en' },
    );
    expect(container.querySelectorAll('[data-character-cards-skeleton] .h-28.w-20')).toHaveLength(6);
    expect(container.querySelectorAll('[data-quote-rows-skeleton] > li')).toHaveLength(3);
    expect(container.querySelectorAll('[data-quote-rows-skeleton] .h-7.w-7')).toHaveLength(2);
  });

  it('matches release metadata and route action rows with localized announcements', () => {
    const { container } = renderWithProviders(
      <>
        <ReleaseRowsSkeleton label="Loading releases" />
        <RouteRowsSkeleton />
      </>,
      { locale: 'en' },
    );
    expect(screen.getByText('Loading releases')).toBeInTheDocument();
    expect(container.querySelector('[data-route-rows-skeleton] > .sr-only')).toBeNull();
    expect(container.querySelectorAll('[data-release-rows-skeleton] > li.rounded-lg')).toHaveLength(4);
    expect(container.querySelectorAll('[data-route-row-skeleton]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-route-row-skeleton] .h-6.w-6')).toHaveLength(18);
  });
});
