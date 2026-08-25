// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AliceNetLinkDialogSkeleton } from '@/components/alicenet/AliceNetLinkDialogSkeleton';
import { ErogePricePanelSkeleton } from '@/components/ErogePricePanelSkeleton';
import { MoreFiltersSkeleton } from '@/components/library/MoreFiltersSkeleton';
import { renderWithProviders } from './helpers/render-component';

describe('lazy surface skeletons', () => {
  afterEach(() => cleanup());

  it('preserves every advanced-library flag control', () => {
    const { container } = renderWithProviders(<MoreFiltersSkeleton />, { locale: 'en' });
    const skeleton = container.querySelector('[data-library-more-filters-skeleton]');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton?.querySelectorAll('.h-11')).toHaveLength(13);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('preserves the complete Eroge Price card', () => {
    const { container } = renderWithProviders(<ErogePricePanelSkeleton />, { locale: 'en' });
    const skeleton = container.querySelector('[data-eroge-price-panel-skeleton]');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveClass('rounded-2xl', 'border', 'p-4');
    expect(skeleton?.querySelectorAll('.h-16')).toHaveLength(3);
    expect(skeleton?.querySelector('.h-40')).toBeInTheDocument();
  });

  it('portals the full AliceNet remapping structure to the document body', () => {
    const { container } = renderWithProviders(<AliceNetLinkDialogSkeleton />, { locale: 'en' });
    expect(container).toBeEmptyDOMElement();
    const skeleton = document.body.querySelector('[data-alicenet-link-dialog-skeleton]');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton?.querySelectorAll('li')).toHaveLength(3);
    expect(skeleton?.querySelectorAll('.h-11')).toHaveLength(9);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
