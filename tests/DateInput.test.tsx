// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateInput } from '@/components/DateInput';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const t = dictionaries.en;

function dayButton(dialog: HTMLElement, text: string, inMonth = true): HTMLElement {
  const buttons = within(dialog).getAllByRole('button', { name: text });
  const button = buttons.find((candidate) => candidate.classList.contains(inMonth ? 'text-white' : 'text-muted/30'));
  if (!button) throw new Error(`Missing calendar day ${text}`);
  return button;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2024, 2, 15, 12, 0, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DateInput', () => {
  it('renders an empty default input and closes on outside click or Escape', () => {
    const rendered = renderWithProviders(<DateInput value="" onChange={vi.fn()} />, { locale: 'en' });
    const trigger = screen.getByRole('button', { name: t.dateInput.empty });
    expect(trigger.parentElement).toHaveClass('input');
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: t.dateInput.empty })).toBeInTheDocument();
    fireEvent.mouseDown(trigger);
    expect(screen.getByRole('dialog', { name: t.dateInput.empty })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    rendered.rerender(<DateInput value="invalid" onChange={vi.fn()} />);
    expect(screen.getByText(t.dateInput.empty)).toBeInTheDocument();
    rendered.rerender(<DateInput value="2024-99-99" onChange={vi.fn()} />);
    expect(screen.getByText(t.dateInput.empty)).toBeInTheDocument();
  });

  it('formats values by locale and follows external value changes', () => {
    const onChange = vi.fn();
    const rendered = renderWithProviders(<DateInput value="2024-03-15" onChange={onChange} ariaLabel="Release date" className="custom" />, { locale: 'en' });
    const trigger = screen.getByRole('button', { name: 'Release date' });
    expect(trigger.parentElement).toHaveClass('custom');
    expect(screen.getByText('March 15, 2024')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByText('March 2024')).toBeInTheDocument();
    expect(dayButton(screen.getByRole('dialog'), '15')).toHaveClass('bg-accent');

    rendered.rerender(<DateInput value="2024-04-05" onChange={onChange} ariaLabel="Release date" />);
    expect(screen.getByText('April 2024')).toBeInTheDocument();
    expect(screen.getByText('April 5, 2024')).toBeInTheDocument();
    rendered.unmount();

    renderWithProviders(<DateInput value="2024-03-15" onChange={onChange} ariaLabel="Date" />, { locale: 'fr' });
    fireEvent.click(screen.getByRole('button', { name: 'Date' }));
    expect(screen.getByText('mars 2024')).toBeInTheDocument();
  });

  it('navigates months and years and selects in-month or adjacent dates', () => {
    const onChange = vi.fn();
    renderWithProviders(<DateInput value="2024-03-15" onChange={onChange} ariaLabel="Date" />, { locale: 'en' });
    const trigger = screen.getByRole('button', { name: 'Date' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: t.dateInput.nextMonth }));
    expect(screen.getByText('April 2024')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.dateInput.prevMonth }));
    expect(screen.getByText('March 2024')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.dateInput.nextYear }));
    expect(screen.getByText('March 2025')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.dateInput.prevYear }));
    expect(screen.getByText('March 2024')).toBeInTheDocument();

    fireEvent.click(dayButton(screen.getByRole('dialog'), '20'));
    expect(onChange).toHaveBeenLastCalledWith('2024-03-20');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.click(dayButton(screen.getByRole('dialog'), '25', false));
    expect(onChange).toHaveBeenLastCalledWith('2024-02-25');
  });

  it('selects today and clears values from both clear controls', () => {
    const onChange = vi.fn();
    renderWithProviders(<DateInput value="2024-03-10" onChange={onChange} ariaLabel="Date" />, { locale: 'en' });
    const trigger = screen.getByRole('button', { name: 'Date' });
    fireEvent.click(trigger);
    expect(dayButton(screen.getByRole('dialog'), '15')).toHaveClass('border-accent/60');
    fireEvent.click(screen.getByRole('button', { name: t.dateInput.today }));
    expect(onChange).toHaveBeenLastCalledWith('2024-03-15');

    fireEvent.click(screen.getByRole('button', { name: t.dateInput.clear }));
    expect(onChange).toHaveBeenLastCalledWith('');
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: t.dateInput.clear }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('traps Tab focus within the open picker while leaving middle controls unchanged', () => {
    renderWithProviders(<DateInput value="2024-03-15" onChange={vi.fn()} ariaLabel="Date" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Date' }));
    const dialog = screen.getByRole('dialog');
    const controls = within(dialog).getAllByRole('button');
    const first = controls[0];
    const middle = controls[1];
    const last = controls.at(-1);
    if (!first || !middle || !last) throw new Error('Missing calendar controls');

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    middle.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(middle).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Unidentified' });
    expect(middle).toHaveFocus();
  });
});
