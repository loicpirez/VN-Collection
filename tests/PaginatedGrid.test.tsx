// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { PaginatedGrid } from '@/components/PaginatedGrid';

afterEach(() => {
  cleanup();
});

/** Build N list items the grid will paginate. */
function items(count: number) {
  return Array.from({ length: count }, (_, i) => <li key={i}>row-{i}</li>);
}

describe('PaginatedGrid', () => {
  it('renders all items and no nav when there is a single page', () => {
    renderWithProviders(
      <PaginatedGrid ariaLabel="Pager" resetKey="a" pageSize={60}>
        {items(5)}
      </PaginatedGrid>,
      { locale: 'en' },
    );
    expect(screen.getByText('row-0')).toBeInTheDocument();
    expect(screen.getByText('row-4')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pager' })).not.toBeInTheDocument();
  });

  it('shows a bounded first page and navigation when items exceed the page size', () => {
    renderWithProviders(
      <PaginatedGrid ariaLabel="Pager" resetKey="a" pageSize={10}>
        {items(25)}
      </PaginatedGrid>,
      { locale: 'en' },
    );
    expect(screen.getByText('row-0')).toBeInTheDocument();
    expect(screen.getByText('row-9')).toBeInTheDocument();
    expect(screen.queryByText('row-10')).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Pager' });
    expect(within(nav).getByText('1-10 / 25')).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /Previous/ })).toBeDisabled();
    expect(within(nav).getByRole('button', { name: /Next/ })).toBeEnabled();
  });

  it('navigates forward and back across pages', async () => {
    const { user } = renderWithProviders(
      <PaginatedGrid ariaLabel="Pager" resetKey="a" pageSize={10}>
        {items(25)}
      </PaginatedGrid>,
      { locale: 'en' },
    );
    const nav = screen.getByRole('navigation', { name: 'Pager' });
    await user.click(within(nav).getByRole('button', { name: /Next/ }));
    expect(screen.getByText('row-10')).toBeInTheDocument();
    expect(screen.queryByText('row-0')).not.toBeInTheDocument();
    expect(within(nav).getByText('11-20 / 25')).toBeInTheDocument();

    await user.click(within(nav).getByRole('button', { name: /Next/ }));
    expect(screen.getByText('row-24')).toBeInTheDocument();
    expect(within(nav).getByText('21-25 / 25')).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /Next/ })).toBeDisabled();

    await user.click(within(nav).getByRole('button', { name: /Previous/ }));
    expect(screen.getByText('row-10')).toBeInTheDocument();
  });

  it('resets to the first page when resetKey changes', async () => {
    const { user, rerender } = renderWithProviders(
      <PaginatedGrid ariaLabel="Pager" resetKey="a" pageSize={10}>
        {items(25)}
      </PaginatedGrid>,
      { locale: 'en' },
    );
    const nav = screen.getByRole('navigation', { name: 'Pager' });
    await user.click(within(nav).getByRole('button', { name: /Next/ }));
    expect(screen.getByText('row-10')).toBeInTheDocument();

    rerender(
      <PaginatedGrid ariaLabel="Pager" resetKey="b" pageSize={10}>
        {items(25)}
      </PaginatedGrid>,
    );
    expect(screen.getByText('row-0')).toBeInTheDocument();
    expect(screen.queryByText('row-10')).not.toBeInTheDocument();
  });

  it('clamps the visible page when the item count shrinks below the current page', async () => {
    const { user, rerender } = renderWithProviders(
      <PaginatedGrid ariaLabel="Pager" resetKey="same" pageSize={10}>
        {items(25)}
      </PaginatedGrid>,
      { locale: 'en' },
    );
    const nav = screen.getByRole('navigation', { name: 'Pager' });
    await user.click(within(nav).getByRole('button', { name: /Next/ }));
    await user.click(within(nav).getByRole('button', { name: /Next/ }));
    expect(screen.getByText('row-24')).toBeInTheDocument();

    rerender(
      <PaginatedGrid ariaLabel="Pager" resetKey="same" pageSize={10}>
        {items(8)}
      </PaginatedGrid>,
    );
    expect(screen.getByText('row-0')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pager' })).not.toBeInTheDocument();
  });
});
