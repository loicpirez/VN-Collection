// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  pathname: '/',
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({ push: navigationMocks.push }),
}));

vi.mock('@/components/Dialog', () => ({
  Dialog: ({
    children,
    onClose,
    open,
    title,
  }: {
    children: React.ReactNode;
    onClose: () => void;
    open: boolean;
    title: React.ReactNode;
  }) => open ? (
    <div role="dialog">
      <h2>{title}</h2>
      <button type="button" onClick={onClose}>dialog close</button>
      {children}
    </div>
  ) : null,
}));

const t = dictionaries.en;

function key(value: string, init: Partial<KeyboardEventInit> = {}) {
  fireEvent.keyDown(window, { key: value, ...init });
}

beforeEach(() => {
  vi.useFakeTimers();
  navigationMocks.pathname = '/';
  navigationMocks.push.mockReset();
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('KeyboardShortcuts', () => {
  it('opens and closes help with its global shortcuts and dialog controls', () => {
    renderWithProviders(<KeyboardShortcuts />, { locale: 'en' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    key('?');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(t.shortcuts.title)).toBeInTheDocument();
    expect(screen.getByText(t.shortcuts.libPage)).toBeInTheDocument();
    key('?');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    key('?');
    fireEvent.click(screen.getByRole('button', { name: t.common.close }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    key('?');
    fireEvent.click(screen.getByRole('button', { name: 'dialog close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    key('Escape');
    key('?');
    key('Escape');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('focuses and selects the page search or scrolls to the top as fallback', () => {
    const select = vi.fn();
    const { rerender } = renderWithProviders(
      <>
        <input data-vn-search defaultValue="query" ref={(input) => {
          if (input) input.select = select;
        }} />
        <KeyboardShortcuts />
      </>,
      { locale: 'en' },
    );
    key('/');
    expect(screen.getByDisplayValue('query')).toHaveFocus();
    expect(select).toHaveBeenCalledTimes(1);

    rerender(<KeyboardShortcuts />);
    key('/');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('ignores shortcuts with modifiers or editable targets', () => {
    renderWithProviders(
      <>
        <input aria-label="editable input" />
        <textarea aria-label="editable textarea" />
        <select aria-label="editable select"><option>One</option></select>
        <div contentEditable aria-label="editable content" ref={(element) => {
          if (element) Object.defineProperty(element, 'isContentEditable', { value: true });
        }} />
        <button type="button">plain button</button>
        <KeyboardShortcuts />
      </>,
      { locale: 'en' },
    );
    key('g', { metaKey: true });
    key('g', { ctrlKey: true });
    key('g', { altKey: true });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'editable input' }), { key: '?' });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'editable textarea' }), { key: '?' });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'editable select' }), { key: '?' });
    fireEvent.keyDown(screen.getByLabelText('editable content'), { key: '?' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'plain button' }), { key: 'z' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(navigationMocks.push).not.toHaveBeenCalled();
  });

  it('runs VN page shortcuts and tolerates absent targets', () => {
    navigationMocks.pathname = '/vn/v1';
    const favorite = vi.fn();
    const scroll = vi.fn();
    renderWithProviders(
      <>
        <button type="button" data-shortcut="vn-favorite" onClick={favorite}>favorite</button>
        <div id="section-edit-form" ref={(element) => {
          if (element) element.scrollIntoView = scroll;
        }} />
        <KeyboardShortcuts />
      </>,
      { locale: 'en' },
    );
    key('f');
    key('e');
    key('n');
    key('z');
    expect(favorite).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('runs library and tags page shortcuts', () => {
    const filter = vi.fn();
    const local = vi.fn();
    const vndb = vi.fn();
    const rendered = renderWithProviders(
      <>
        <button type="button" data-shortcut="lib-filter" onClick={filter}>filter</button>
        <button type="button" data-shortcut="tags-tab-local" onClick={local}>local</button>
        <button type="button" data-shortcut="tags-tab-vndb" onClick={vndb}>vndb</button>
        <KeyboardShortcuts />
      </>,
      { locale: 'en' },
    );
    key('f');
    expect(filter).toHaveBeenCalledTimes(1);

    navigationMocks.pathname = '/tags';
    rendered.rerender(
      <>
        <button type="button" data-shortcut="lib-filter" onClick={filter}>filter</button>
        <button type="button" data-shortcut="tags-tab-local" onClick={local}>local</button>
        <button type="button" data-shortcut="tags-tab-vndb" onClick={vndb}>vndb</button>
        <KeyboardShortcuts />
      </>,
    );
    key('1');
    key('2');
    key('z');
    expect(local).toHaveBeenCalledTimes(1);
    expect(vndb).toHaveBeenCalledTimes(1);
  });

  it('navigates with the timed prefix and disarms unknown or expired routes', () => {
    const rendered = renderWithProviders(<KeyboardShortcuts />, { locale: 'en' });
    key('g');
    key('h');
    expect(navigationMocks.push).toHaveBeenCalledWith('/');
    key('g');
    key('z');
    expect(navigationMocks.push).toHaveBeenCalledTimes(1);
    key('g');
    act(() => vi.advanceTimersByTime(1200));
    key('h');
    expect(navigationMocks.push).toHaveBeenCalledTimes(1);
    key('g');
    rendered.unmount();
  });
});
