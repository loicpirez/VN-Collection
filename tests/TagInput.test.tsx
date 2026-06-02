// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TagInput } from '@/components/TagInput';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const t = dictionaries.en;

afterEach(() => {
  cleanup();
});

describe('TagInput', () => {
  it('commits trimmed values by keyboard and removes the final value with backspace', () => {
    const onChange = vi.fn();
    const rendered = renderWithProviders(
      <TagInput values={[]} onChange={onChange} placeholder="Tags" className="custom" />,
      { locale: 'en' },
    );
    const input = screen.getByLabelText('Tags');
    expect(input).toHaveAttribute('placeholder', 'Tags');
    expect(input).not.toHaveAttribute('list');
    expect(rendered.container.firstChild).toHaveClass('custom');

    fireEvent.change(input, { target: { value: '  first  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['first']);

    rendered.rerender(<TagInput values={['first']} onChange={onChange} placeholder="Tags" />);
    expect(input).toHaveAttribute('placeholder', '');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(input).toHaveFocus();
  });

  it('commits by comma and blur while ignoring empty, duplicate, and over-limit values', () => {
    const onChange = vi.fn();
    const rendered = renderWithProviders(<TagInput values={[]} onChange={onChange} placeholder="Tags" maxLength={4} />, { locale: 'en' });
    const input = screen.getByLabelText('Tags');

    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'longer' } });
    fireEvent.keyDown(input, { key: ',' });
    expect(onChange).toHaveBeenCalledWith(['long']);

    rendered.rerender(<TagInput values={['same']} onChange={onChange} placeholder="Tags" />);
    fireEvent.change(input, { target: { value: ' same ' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);

    rendered.rerender(<TagInput values={['only']} onChange={onChange} placeholder="Tags" maxValues={1} />);
    fireEvent.change(input, { target: { value: 'blocked' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);

    rendered.rerender(<TagInput values={[]} onChange={onChange} placeholder="Tags" />);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('filters suggestions, caps the visible list, and commits a suggestion before blur', () => {
    const onChange = vi.fn();
    const suggestions = ['alpha', 'beta', ...Array.from({ length: 14 }, (_, index) => `item-${index}`)];
    renderWithProviders(
      <TagInput values={['beta']} onChange={onChange} placeholder="Tags" suggestions={suggestions} />,
      { locale: 'en' },
    );
    const input = screen.getByLabelText('Tags');
    expect(input).toHaveAttribute('list');

    fireEvent.focus(input);
    expect(screen.queryByRole('button', { name: 'beta' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(13);

    fireEvent.change(input, { target: { value: 'ITEM-1' } });
    expect(screen.getByRole('button', { name: 'item-1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'alpha' })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'item-1' }));
    expect(onChange).toHaveBeenCalledWith(['beta', 'item-1']);
  });

  it('removes a selected value and focuses the input when the wrapper is clicked', () => {
    const onChange = vi.fn();
    const rendered = renderWithProviders(<TagInput values={['first', 'second']} onChange={onChange} placeholder="Tags" />, { locale: 'en' });
    const input = screen.getByRole('textbox', { name: 'Tags' });
    const remove = screen.getByRole('button', { name: t.tagInput.removeTag.replace('{v}', 'first') });

    fireEvent.click(remove);
    expect(onChange).toHaveBeenCalledWith(['second']);
    expect(input).toHaveFocus();
    input.blur();
    fireEvent.click(rendered.container.firstElementChild as HTMLElement);
    expect(input).toHaveFocus();
  });
});
