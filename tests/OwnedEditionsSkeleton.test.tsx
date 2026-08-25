// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OwnedEditionsSkeleton } from '@/components/OwnedEditionsSkeleton';
import { renderWithProviders } from './helpers/render-component';

afterEach(cleanup);

describe('OwnedEditionsSkeleton', () => {
  it('matches the add action, release covers, metadata, and row tools', () => {
    const { container } = renderWithProviders(<OwnedEditionsSkeleton label="Loading editions" />);

    expect(screen.getByText('Loading editions')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-owned-edition-row-skeleton]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-owned-edition-row-skeleton] .w-full.rounded-md')).toHaveLength(2);
    expect(container.querySelectorAll('[data-owned-edition-row-skeleton] .h-7.w-7')).toHaveLength(6);
    expect(container.querySelectorAll('[data-owned-edition-row-skeleton] .grid > div')).toHaveLength(10);
  });
});
