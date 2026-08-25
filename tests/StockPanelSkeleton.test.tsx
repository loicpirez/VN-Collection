// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StockOfferRowsSkeleton, StockPanelSkeleton } from '@/components/StockPanelSkeleton';
import { renderWithProviders } from './helpers/render-component';

afterEach(cleanup);

describe('StockPanelSkeleton', () => {
  it('matches offer cards and announces an internal data load', () => {
    const { container } = renderWithProviders(
      <StockOfferRowsSkeleton label="Loading stock offers" className="custom-spacing" />,
    );

    expect(screen.getByText('Loading stock offers')).toBeInTheDocument();
    expect(container.querySelector('[data-stock-offer-rows-skeleton]')).toHaveClass('custom-spacing');
    expect(container.querySelectorAll('[data-stock-offer-card-skeleton]')).toHaveLength(4);
    expect(container.querySelector('[data-stock-offer-rows-skeleton] ul')).toHaveClass('lg:grid-cols-2');
  });

  it('supports framed and host-framed panel loading states', () => {
    const framed = renderWithProviders(<StockPanelSkeleton />);
    expect(framed.container.querySelector('[data-stock-panel-skeleton]')).toHaveClass('bg-bg-card');
    expect(framed.container.querySelector('[data-stock-offer-rows-skeleton] .sr-only')).toBeNull();
    expect(framed.container.querySelectorAll('[data-stock-offer-card-skeleton]')).toHaveLength(4);
    framed.unmount();

    const bare = renderWithProviders(<StockPanelSkeleton bare label="Loading stock" />);
    expect(bare.container.querySelector('[data-stock-panel-skeleton]')).not.toHaveClass('bg-bg-card');
    expect(screen.getByText('Loading stock')).toBeInTheDocument();
  });
});
