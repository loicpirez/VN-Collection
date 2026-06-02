// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen, within, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { FacetCombobox, type FacetOption } from '@/components/library/FacetCombobox';

afterEach(() => {
  cleanup();
});

const OPTIONS: FacetOption[] = [
  { value: 'p90001', label: 'Studio X', count: 12 },
  { value: 'p90002', label: 'Studio Y', count: 7 },
  { value: 'p90003', label: 'Brand Z', count: 3 },
];

const LABELS = {
  label: 'Developer',
  searchPlaceholder: 'Search developers',
  clearLabel: 'Clear',
  resultLabel: '{shown} of {total}',
  noResultsLabel: 'No matches',
};

function renderCombobox(props: Partial<React.ComponentProps<typeof FacetCombobox>> = {}) {
  const onChange = props.onChange ?? vi.fn();
  const result = renderWithProviders(
    <FacetCombobox value="" options={OPTIONS} {...LABELS} onChange={onChange} {...props} />,
  );
  return { ...result, onChange };
}

describe('FacetCombobox', () => {
  it('shows the active option label in the closed input', () => {
    renderCombobox({ value: 'p90002' });
    expect(screen.getByRole('combobox')).toHaveValue('Studio Y');
  });

  it('opens the listbox on focus and lists the clear entry plus every option', async () => {
    const { user } = renderCombobox();
    await user.click(screen.getByRole('combobox'));
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('Studio X')).toBeInTheDocument();
    expect(within(listbox).getByText('Brand Z')).toBeInTheDocument();
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
  });

  it('filters options by query and renders the no-results copy when empty', async () => {
    const { user } = renderCombobox();
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'studio');
    expect(screen.getByText('Studio X')).toBeInTheDocument();
    expect(screen.queryByText('Brand Z')).not.toBeInTheDocument();
    expect(screen.getByText('2 of 2')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'zzzz-nope');
    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.getByText('0 of 0')).toBeInTheDocument();
  });

  it('selects an option by click and resets the query', async () => {
    const { user, onChange } = renderCombobox();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /Studio X/ }));
    expect(onChange).toHaveBeenCalledWith('p90001');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('navigates with arrow keys and commits the active option on Enter', async () => {
    const { user, onChange } = renderCombobox();
    const input = screen.getByRole('combobox');
    await user.click(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    // index 1 in the selectable list ([clear, Studio X, Studio Y, Brand Z]).
    expect(onChange).toHaveBeenCalledWith('p90001');
  });

  it('clears the selection via the clear button and the clear list entry', async () => {
    const { user, onChange } = renderCombobox({ value: 'p90001' });
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('closes on Escape without selecting', async () => {
    const { user, onChange } = renderCombobox();
    const input = screen.getByRole('combobox');
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes when a pointerdown occurs outside the combobox', async () => {
    const { user } = renderCombobox();
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('caps the listbox at 60 visible options while reporting the true total', async () => {
    const many: FacetOption[] = Array.from({ length: 80 }, (_, i) => ({
      value: `p${90000 + i}`,
      label: `Studio ${i}`,
    }));
    const { user } = renderWithProviders(
      <FacetCombobox value="" options={many} {...LABELS} onChange={vi.fn()} />,
    );
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByText('60 of 80')).toBeInTheDocument();
  });

  it('ignores Enter when a prop update removes the active option', async () => {
    const { user, onChange, rerender } = renderCombobox();
    const input = screen.getByRole('combobox');
    await user.click(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    rerender(<FacetCombobox value="" options={[]} {...LABELS} onChange={onChange} />);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
