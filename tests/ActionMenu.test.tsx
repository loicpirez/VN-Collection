// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionMenu } from '@/components/ActionMenu';
import { renderWithProviders } from './helpers/render-component';

let frames: FrameRequestCallback[] = [];

function flushFrames() {
  act(() => {
    const pending = frames;
    frames = [];
    pending.forEach((frame) => frame(0));
  });
}

function rect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    bottom: 30,
    height: 20,
    left: 10,
    right: 30,
    top: 10,
    width: 20,
    x: 10,
    y: 10,
    toJSON: () => ({}),
    ...overrides,
  };
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ActionMenu', () => {
  it('toggles the default menu, stops wrapper propagation, and handles item activation rules', async () => {
    const outerClick = vi.fn();
    const outerPointer = vi.fn();
    const rendered = renderWithProviders(
      <div onClick={outerClick} onPointerDown={outerPointer}>
        <ActionMenu label="Actions" trigger={<span>Open</span>}>
          <span>Plain text</span>
          <button type="button" data-menu-keep-open>Keep</button>
          <a href="#target">Navigate</a>
        </ActionMenu>
      </div>,
    );
    const trigger = screen.getByRole('button', { name: 'Actions' });
    expect(trigger).toHaveAttribute('title', 'Actions');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(rendered.container.querySelector('.lucide-chevron-down')).toBeInTheDocument();
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(outerPointer).not.toHaveBeenCalled();
    expect(outerClick).not.toHaveBeenCalled();

    const menu = screen.getByRole('menu', { name: 'Actions' });
    expect(menu).toHaveClass('invisible', 'top-full', 'left-0');
    fireEvent.pointerDown(menu);
    fireEvent.mouseDown(menu);
    expect(outerPointer).not.toHaveBeenCalled();
    flushFrames();
    expect(menu).toHaveClass('visible', 'top-full', 'left-0');

    fireEvent.click(screen.getByText('Plain text'));
    expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Navigate' }));
    expect(screen.queryByRole('menu', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('supports roving focus, Tab wrapping, Escape closing, and focus restoration', async () => {
    const rendered = renderWithProviders(
      <ActionMenu label="Actions" trigger="Open">
        <button type="button" role="menuitem">First</button>
        <button type="button" role="menuitem" disabled>Disabled</button>
        <button type="button" role="menuitemcheckbox">Last</button>
      </ActionMenu>,
    );
    const trigger = screen.getByRole('button', { name: 'Actions' });
    trigger.focus();
    fireEvent.click(trigger);
    flushFrames();
    const first = screen.getByRole('menuitem', { name: 'First' });
    const last = screen.getByRole('menuitemcheckbox', { name: 'Last' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: 'End' });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Home' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Unidentified' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    flushFrames();
    fireEvent.mouseDown(rendered.container);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not steal focus after a close that follows focus movement', () => {
    renderWithProviders(
      <div>
        <button type="button">Outside</button>
        <ActionMenu label="Actions" trigger="Open">
          <button type="button">Inside</button>
        </ActionMenu>
      </div>,
    );
    const outside = screen.getByRole('button', { name: 'Outside' });
    const trigger = screen.getByRole('button', { name: 'Actions' });
    outside.focus();
    fireEvent.click(trigger);
    flushFrames();
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus();
    outside.focus();
    fireEvent.click(trigger);
    expect(outside).toHaveFocus();
  });

  it('supports empty menus and collision-based top-right placement', () => {
    const first = renderWithProviders(
      <ActionMenu label="Empty" title="Explicit title" trigger="Open" hideChevron defaultPlacement="bottom-right">
        <span>Empty</span>
      </ActionMenu>,
    );
    const trigger = screen.getByRole('button', { name: 'Empty' });
    expect(trigger).toHaveAttribute('title', 'Explicit title');
    expect(first.container.querySelector('.lucide-chevron-down')).not.toBeInTheDocument();
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect({ bottom: 930, left: 950, right: 970, top: 910 }));
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Empty' });
    Object.defineProperty(menu, 'offsetHeight', { configurable: true, value: 100 });
    Object.defineProperty(menu, 'offsetWidth', { configurable: true, value: 100 });
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Tab' });
    flushFrames();
    expect(menu).toHaveClass('bottom-full', 'right-0', 'visible');

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 2000 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 2000 });
    fireEvent.scroll(window);
    expect(menu).toHaveClass('top-full', 'left-0');
    fireEvent.resize(window);
    expect(menu).toHaveClass('top-full', 'left-0');
    first.unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
