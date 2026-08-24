// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LangFlag } from '@/components/LangFlag';
import { PaginatedGrid } from '@/components/PaginatedGrid';
import { ProducerLogo } from '@/components/ProducerLogo';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusIcon } from '@/components/StatusIcon';
import { renderWithProviders } from './helpers/render-component';

afterEach(() => cleanup());

describe('simple component default contracts', () => {
  it('renders a localized language icon without optional code or styling', () => {
    renderWithProviders(<LangFlag lang="ja" />, { locale: 'en' });
    const icon = screen.getByLabelText('Japanese');
    expect(icon).toHaveAttribute('class', '');
    expect(icon).not.toHaveTextContent('JA');
  });

  it('paginates at sixty items when page size is omitted', () => {
    renderWithProviders(
      <PaginatedGrid ariaLabel="Default pager" resetKey="default">
        {Array.from({ length: 61 }, (_, index) => <span key={index}>item-{index}</span>)}
      </PaginatedGrid>,
      { locale: 'en' },
    );
    expect(within(screen.getByRole('navigation', { name: 'Default pager' })).getByText('1-60 / 61')).toBeInTheDocument();
  });

  it('uses default logo dimensions and fallback styling', () => {
    renderWithProviders(<ProducerLogo producer={{ name: 'Studio Placeholder' }} />, { locale: 'en' });
    expect(screen.getByLabelText('Studio Placeholder')).toHaveStyle({ width: '48px', height: '48px' });
  });

  it('uses default status badge and icon classes', () => {
    const { container } = renderWithProviders(
      <>
        <StatusBadge status="completed" />
        <StatusIcon status="planning" />
      </>,
      { locale: 'en' },
    );
    expect(screen.getByText('Completed').parentElement).toHaveClass('bg-status-completed');
    expect(container.querySelector('svg.h-4.w-4')).toBeInTheDocument();
  });
});
