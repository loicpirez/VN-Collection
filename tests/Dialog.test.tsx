// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { createRef, useRef } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogPortal, useDialogA11y } from '@/components/Dialog';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    const rendered = render(<Dialog open={false} onClose={vi.fn()} title="Title">Body</Dialog>);
    expect(rendered.container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders an accessible modal, locks scrolling, traps focus, and closes on Escape', () => {
    const onClose = vi.fn();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    render(
      <Dialog open onClose={onClose} title="Title" description="Description">
        <button type="button">First</button>
        <button type="button" inert>Ignored</button>
        <button type="button">Middle</button>
        <button type="button">Last</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Title' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Description');
    expect(dialog).toHaveClass('max-h-[calc(100vh-1.5rem)]', 'p-4');
    expect(document.body.style.overflow).toBe('hidden');
    const first = within(dialog).getByRole('button', { name: 'First' });
    const last = within(dialog).getByRole('button', { name: 'Last' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(first).toHaveFocus();
    within(dialog).getByRole('button', { name: 'Middle' }).focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(within(dialog).getByRole('button', { name: 'Middle' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Unidentified' });
    expect(within(dialog).getByRole('button', { name: 'Middle' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    cleanup();
    expect(document.body.style.overflow).toBe('');
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('supports disabled close actions, custom classes, hidden titles, and backdrop close', () => {
    const onClose = vi.fn();
    const rendered = render(
      <Dialog
        open
        onClose={onClose}
        title="Hidden title"
        panelClassName="max-h-[10px] custom"
        hideTitleVisually
        disableEscape
        disableBackdropClose
      >
        <span>Body</span>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Hidden title' });
    expect(dialog).toHaveClass('max-h-[10px]', 'custom');
    expect(dialog).not.toHaveClass('max-h-[calc(100vh-1.5rem)]');
    expect(screen.getByRole('heading', { name: 'Hidden title' })).toHaveClass('sr-only');
    expect(dialog).not.toHaveAttribute('aria-describedby');
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(dialog.previousElementSibling!);
    expect(onClose).not.toHaveBeenCalled();

    rendered.rerender(<Dialog open onClose={onClose} title="Title">Body</Dialog>);
    fireEvent.click(screen.getByRole('dialog').previousElementSibling!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps focus on an empty panel when Tab is pressed', () => {
    render(<Dialog open onClose={vi.fn()} title="Empty">Body</Dialog>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    expect(window.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });
});

function HookHarness({
  open,
  onClose,
  disableEscape,
  empty = false,
}: {
  open: boolean;
  onClose: () => void;
  disableEscape?: boolean;
  empty?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y({ open, onClose, panelRef, disableEscape });
  return open ? (
    <div ref={panelRef} tabIndex={-1} role="dialog">
      {!empty && (
        <>
          <button type="button">First</button>
          <button type="button">Middle</button>
          <button type="button">Last</button>
        </>
      )}
    </div>
  ) : null;
}

describe('useDialogA11y', () => {
  it('locks scrolling, focuses, traps Tab, closes on Escape, and restores focus', () => {
    const onClose = vi.fn();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const rendered = render(<HookHarness open onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    const first = within(dialog).getByRole('button', { name: 'First' });
    const last = within(dialog).getByRole('button', { name: 'Last' });
    expect(first).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(first).toHaveFocus();
    within(dialog).getByRole('button', { name: 'Middle' }).focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(within(dialog).getByRole('button', { name: 'Middle' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Unidentified' });
    expect(within(dialog).getByRole('button', { name: 'Middle' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    rendered.unmount();
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('supports disabled Escape and an empty panel', () => {
    const onClose = vi.fn();
    render(<HookHarness open onClose={onClose} disableEscape empty />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    expect(window.dispatchEvent(event)).toBe(false);
  });

  it('does not install modal behavior while closed', () => {
    const rendered = render(<HookHarness open={false} onClose={vi.fn()} />);
    expect(rendered.container).toBeEmptyDOMElement();
    expect(document.body.style.overflow).toBe('');
  });

  it('tolerates an open hook before its caller mounts a panel', () => {
    function MissingPanel() {
      const panelRef = createRef<HTMLDivElement>();
      useDialogA11y({ open: true, onClose: vi.fn(), panelRef });
      return null;
    }
    expect(() => render(<MissingPanel />)).not.toThrow();
  });
});

describe('DialogPortal', () => {
  it('portals custom layouts to the document body', () => {
    render(<DialogPortal><span>Portal body</span></DialogPortal>);
    expect(screen.getByText('Portal body')).toBeInTheDocument();
  });
});
