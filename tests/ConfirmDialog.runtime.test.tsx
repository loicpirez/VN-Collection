// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmProvider, useConfirm } from '@/components/ConfirmDialog';
import { I18nProvider } from '@/lib/i18n/client';
import { dictionaries } from '@/lib/i18n/dictionaries';

const t = dictionaries.en;

function ConfirmControls() {
  const { confirm, prompt } = useConfirm();
  const [history, setHistory] = useState<string[]>([]);
  const append = (value: string) => setHistory((current) => [...current, value]);
  return (
    <div>
      <output data-testid="history">{history.join('|')}</output>
      <button
        type="button"
        onClick={async () => append(`confirm:${await confirm({ message: 'Proceed?' })}`)}
      >
        default confirm
      </button>
      <button
        type="button"
        onClick={async () => append(`danger:${await confirm({
          title: 'Danger',
          message: 'Erase data?',
          tone: 'danger',
          requireTyping: 'ERASE',
          confirmLabel: 'Erase',
          cancelLabel: 'Keep',
        })}`)}
      >
        danger confirm
      </button>
      <button
        type="button"
        onClick={async () => append(`prompt:${await prompt({
          title: 'Name',
          message: 'Enter a name',
          initial: ' ',
          placeholder: 'Type name',
          confirmLabel: 'Save name',
          cancelLabel: 'Skip',
          validate: (value) => value.trim() ? null : 'Required',
        })}`)}
      >
        validated prompt
      </button>
      <button
        type="button"
        onClick={async () => append(`message:${await prompt({ message: 'Message only' })}`)}
      >
        message prompt
      </button>
      <button
        type="button"
        onClick={async () => append(`blank:${await prompt({})}`)}
      >
        blank prompt
      </button>
      <button
        type="button"
        onClick={() => {
          void confirm({ message: 'Queued confirm' }).then((value) => append(`queued-confirm:${value}`));
          void prompt({ message: 'Queued prompt' }).then((value) => append(`queued-prompt:${value}`));
        }}
      >
        queue dialogs
      </button>
    </div>
  );
}

function MissingConfirmProvider() {
  useConfirm();
  return null;
}

function renderControls() {
  return render(
    <I18nProvider locale="en" dict={t}>
      <ConfirmProvider>
        <ConfirmControls />
      </ConfirmProvider>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('ConfirmProvider runtime', () => {
  it('rejects useConfirm consumers outside the provider', () => {
    expect(() => render(<MissingConfirmProvider />)).toThrow('useConfirm must be used inside <ConfirmProvider>');
  });

  it('accepts and dismisses default confirmations while restoring scroll and focus', async () => {
    renderControls();
    const launch = screen.getByRole('button', { name: 'default confirm' });
    launch.focus();
    fireEvent.click(launch);
    const dialog = screen.getByRole('dialog');
    expect(screen.getByText(t.common.confirmTitle)).toBeInTheDocument();
    expect(screen.getByText('Proceed?')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByText('Proceed?'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('confirm:false'));
    expect(document.body.style.overflow).toBe('');
    expect(launch).toHaveFocus();

    fireEvent.click(launch);
    fireEvent.click(screen.getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('confirm:false|confirm:true'));

    fireEvent.click(launch);
    fireEvent.click(screen.getByRole('dialog'));
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('confirm:false|confirm:true|confirm:false'));

    fireEvent.click(launch);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('confirm:false|confirm:true|confirm:false|confirm:false'));
  });

  it('enforces typed danger confirmation and traps keyboard focus', async () => {
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'danger confirm' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(t.common.dangerWarning)).toBeInTheDocument();
    const input = screen.getByRole('textbox');
    const erase = screen.getByRole('button', { name: 'Erase' });
    expect(erase).toBeDisabled();
    fireEvent.change(input, { target: { value: 'wrong' } });
    expect(erase).toBeDisabled();
    fireEvent.change(input, { target: { value: 'ERASE' } });
    expect(erase).toBeEnabled();

    erase.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getByRole('button', { name: t.common.close })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(erase).toHaveFocus();
    input.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(input).toHaveFocus();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.click(erase);
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('danger:true'));

    fireEvent.click(screen.getByRole('button', { name: 'danger confirm' }));
    fireEvent.click(screen.getByRole('button', { name: t.common.close }));
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('danger:true|danger:false'));
  });

  it('validates and trims prompt submissions', async () => {
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'validated prompt' }));
    expect(screen.getByText('Enter a name')).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAttribute('placeholder', 'Type name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Required')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Save name' });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest('form')!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '  Alice  ' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('prompt:Alice'));
  });

  it('dismisses prompts with backdrop and Escape and cycles prompt focus', async () => {
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'message prompt' }));
    expect(screen.getByRole('textbox', { name: 'Message only' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('dialog'));
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('message:null'));

    fireEvent.click(screen.getByRole('button', { name: 'blank prompt' }));
    expect(screen.getByRole('textbox', { name: t.common.confirmTitle })).toHaveAttribute('placeholder', '');
    const close = screen.getByRole('button', { name: t.common.close });
    const submit = screen.getByRole('button', { name: t.common.confirm });
    close.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(submit).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();
    screen.getByRole('textbox', { name: t.common.confirmTitle }).focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getByRole('textbox', { name: t.common.confirmTitle })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('message:null|blank:null'));

    fireEvent.click(screen.getByRole('button', { name: 'blank prompt' }));
    fireEvent.click(screen.getByRole('button', { name: t.common.close }));
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('message:null|blank:null|blank:null'));

    fireEvent.click(screen.getByRole('button', { name: 'message prompt' }));
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('message:null|blank:null|blank:null|message:null'));
  });

  it('presents queued dialogs in request order', async () => {
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'queue dialogs' }));
    expect(screen.getByText('Queued confirm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.common.confirm }));
    const prompt = screen.getByRole('textbox', { name: 'Queued prompt' });
    fireEvent.change(prompt, { target: { value: ' done ' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('queued-confirm:true|queued-prompt:done'));
  });

  it('does not restore prompt focus to an element removed while the modal was open', async () => {
    renderControls();
    const launch = screen.getByRole('button', { name: 'message prompt' });
    launch.focus();
    fireEvent.click(launch);
    launch.remove();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('message:null'));
  });
});
