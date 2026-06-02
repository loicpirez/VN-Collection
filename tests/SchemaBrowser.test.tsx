// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaBrowser } from '@/components/SchemaBrowser';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const t = dictionaries.en;

const schema = {
  nested: {
    platform: {
      win: 'Windows',
      version: 12,
      active: false,
    },
    note: 'Beta',
  },
  array: ['Alpha', 42, true, null, undefined],
  empty: {},
};

async function commitFilter(value: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: t.schemaPage.filterPlaceholder }), { target: { value } });
  await act(async () => {
    vi.advanceTimersByTime(150);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SchemaBrowser', () => {
  it('renders an empty state for absent or scalar schema payloads', async () => {
    const rendered = renderWithProviders(<SchemaBrowser schema={null} />, { locale: 'en' });
    expect(screen.getByText(t.schemaPage.empty)).toBeInTheDocument();
    await commitFilter('missing');
    expect(screen.getByText(t.schemaPage.empty)).toBeInTheDocument();
    rendered.rerender(<SchemaBrowser schema="invalid" />);
    expect(screen.getByText(t.schemaPage.empty)).toBeInTheDocument();
  });

  it('expands object and array nodes and renders every scalar display variant', () => {
    renderWithProviders(<SchemaBrowser schema={schema} />, { locale: 'en' });
    const array = screen.getByRole('button', { name: 'array' });
    const empty = screen.getByRole('button', { name: 'empty' });
    const nested = screen.getByRole('button', { name: 'nested' });
    expect(array).toHaveAttribute('aria-expanded', 'false');
    expect(empty).toHaveTextContent('{0}');

    fireEvent.click(array);
    expect(array).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('"Alpha"')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByText('null')).toBeInTheDocument();
    expect(screen.getByText('undefined')).toBeInTheDocument();

    fireEvent.click(nested);
    fireEvent.click(screen.getByRole('button', { name: 'platform' }));
    expect(screen.getByText('"Windows"')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('false')).toBeInTheDocument();
    fireEvent.click(nested);
    expect(nested).toHaveAttribute('aria-expanded', 'false');
  });

  it('debounces filtering, highlights matches, hides unrelated nodes, and preserves matching expansion after clear', async () => {
    renderWithProviders(<SchemaBrowser schema={schema} />, { locale: 'en' });
    const input = screen.getByRole('searchbox', { name: t.schemaPage.filterPlaceholder });
    fireEvent.change(input, { target: { value: 'ignored' } });
    fireEvent.change(input, { target: { value: ' win ' } });
    await act(async () => {
      vi.advanceTimersByTime(149);
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'array' })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: 'array' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'nested' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'platform' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText('win')).not.toHaveLength(0);

    await commitFilter('');
    expect(screen.getByRole('button', { name: 'nested' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'platform' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('matches numeric scalar values and renders no nodes for unsupported scalar matches', async () => {
    renderWithProviders(<SchemaBrowser schema={schema} />, { locale: 'en' });
    await commitFilter('42');
    expect(screen.getByRole('button', { name: 'array' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('42')).toBeInTheDocument();

    await commitFilter('true');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
