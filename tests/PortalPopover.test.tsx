// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { createRef, useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortalPopover } from '@/components/PortalPopover';

let nextFrame = 1;
let frames = new Map<number, FrameRequestCallback>();
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;
let cancelAnimationFrame: ReturnType<typeof vi.fn<(handle: number) => void>>;

function flushFrames(): void {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  });
}

function setTriggerRect(trigger: HTMLElement, top: number, left: number): void {
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
    x: left,
    y: top,
    top,
    bottom: top + 30,
    left,
    right: left + 100,
    width: 100,
    height: 30,
    toJSON: () => ({}),
  });
}

function setPanelSize(panel: HTMLElement): void {
  Object.defineProperties(panel, {
    offsetWidth: { configurable: true, value: 250 },
    offsetHeight: { configurable: true, value: 200 },
  });
}

function PopoverHarness({ empty = false, customClass = false }: { empty?: boolean; customClass?: boolean }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <button type="button">outside</button>
      <PortalPopover
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        label="Actions"
        panelId="actions-panel"
        panelClassName={customClass ? 'custom-panel' : undefined}
      >
        {empty ? (
          <span>empty</span>
        ) : (
          <>
            <button type="button">first</button>
            <button type="button" inert>ignored</button>
            <button type="button">last</button>
          </>
        )}
      </PortalPopover>
    </div>
  );
}

beforeEach(() => {
  nextFrame = 1;
  frames = new Map();
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 800 });
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => {
      const handle = nextFrame++;
      frames.set(handle, callback);
      return handle;
    },
  });
  cancelAnimationFrame = vi.fn<(handle: number) => void>((handle) => {
    frames.delete(handle);
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: cancelAnimationFrame,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: originalRequestAnimationFrame,
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: originalCancelAnimationFrame,
  });
});

describe('PortalPopover runtime', () => {
  it('positions an anchored panel and closes only for outside pointer input', () => {
    render(<PopoverHarness customClass />);
    const trigger = screen.getByRole('button', { name: 'open' });
    setTriggerRect(trigger, 100, 120);
    fireEvent.click(trigger);
    const panel = screen.getByRole('dialog', { hidden: true });
    setPanelSize(panel);
    flushFrames();

    expect(panel).toHaveAttribute('id', 'actions-panel');
    expect(panel).toHaveClass('custom-panel');
    expect(panel).toHaveStyle({ top: '138px', left: '120px', visibility: 'visible' });
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();

    fireEvent.mouseDown(panel);
    expect(screen.getByRole('dialog', { name: 'Actions' })).toBeInTheDocument();
    fireEvent.mouseDown(trigger);
    expect(screen.getByRole('dialog', { name: 'Actions' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('dialog', { name: 'Actions' })).toBeNull();
  });

  it('repositions on viewport events, traps focus, closes on Escape, and restores trigger focus', () => {
    render(<PopoverHarness />);
    const trigger = screen.getByRole('button', { name: 'open' });
    setTriggerRect(trigger, 100, 120);
    trigger.focus();
    fireEvent.click(trigger);
    const panel = screen.getByRole('dialog', { hidden: true });
    setPanelSize(panel);
    flushFrames();

    const first = screen.getByRole('button', { name: 'first' });
    const last = screen.getByRole('button', { name: 'last' });
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByRole('dialog', { name: 'Actions' })).toBeInTheDocument();

    fireEvent(window, new Event('resize'));
    fireEvent(window, new Event('scroll'));
    expect(panel).toHaveStyle({ visibility: 'visible' });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Actions' })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('uses the bottom-sheet layout on narrow viewports', () => {
    window.innerWidth = 500;
    render(<PopoverHarness />);
    const trigger = screen.getByRole('button', { name: 'open' });
    setTriggerRect(trigger, 100, 120);
    fireEvent.click(trigger);
    const panel = screen.getByRole('dialog', { hidden: true });
    setPanelSize(panel);
    flushFrames();
    expect(panel).toHaveStyle({ left: '0px', right: '0px', bottom: '0px', width: '100vw', maxHeight: '80vh' });
  });

  it('tolerates a missing anchor and an empty focus trap', () => {
    const triggerRef = createRef<HTMLElement>();
    const onClose = vi.fn<() => void>();
    render(
      <PortalPopover open onClose={onClose} triggerRef={triggerRef} label="Detached">
        <span>empty</span>
      </PortalPopover>,
    );
    const panel = screen.getByRole('dialog', { hidden: true });
    setPanelSize(panel);
    flushFrames();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(panel).toHaveStyle({ visibility: 'hidden' });
  });

  it('renders nothing while closed and cancels pending frames on unmount', () => {
    const triggerRef = createRef<HTMLElement>();
    const onClose = vi.fn<() => void>();
    const { rerender, unmount } = render(
      <PortalPopover open={false} onClose={onClose} triggerRef={triggerRef} label="Closed">
        body
      </PortalPopover>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(
      <PortalPopover open onClose={onClose} triggerRef={triggerRef} label="Closed">
        body
      </PortalPopover>,
    );
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
