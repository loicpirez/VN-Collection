'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

export type ConfirmTone = 'default' | 'danger';

interface ConfirmOptions {
  /** Optional title above the message. */
  title?: string;
  /** Main body — supports newlines. */
  message: string;
  /** Confirm button label; defaults to t.common.confirm. */
  confirmLabel?: string;
  /** Cancel button label; defaults to t.common.cancel. */
  cancelLabel?: string;
  /** "danger" styles the confirm button red; default is accent-colored. */
  tone?: ConfirmTone;
  /**
   * When provided, the user must type this string into a verify input
   * before the confirm button enables. Useful for irreversible ops
   * like "wipe DB" or "delete N items". Localizable label is the
   * helper text "Type X to confirm".
   */
  requireTyping?: string;
}

export interface PromptOptions {
  title?: string;
  message?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional client-side validator. Return an error string to block submit. */
  validate?: (value: string) => string | null;
}

interface ConfirmApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /**
   * Styled replacement for `window.prompt()`. Resolves to the entered
   * string (trimmed) on Enter / Confirm, or `null` on Cancel / ESC /
   * backdrop click. Validator (when supplied) runs on every keystroke
   * and disables the confirm button when it returns a non-null error.
   */
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmApi | null>(null);

type QueuedEntry =
  | (ConfirmOptions & { id: number; kind: 'confirm'; resolve: (ok: boolean) => void })
  | (PromptOptions & { id: number; kind: 'prompt'; resolve: (value: string | null) => void });

let nextId = 1;

/**
 * Promise-based confirm + prompt replacement that renders a fully-
 * styled modal instead of the platform's native dialog. The native
 * confirm/prompt blocks the main thread, can't be themed, and on
 * iOS / Android looks completely foreign to the rest of the app.
 *
 * Usage:
 *   const { confirm } = useConfirm();
 *   const ok = await confirm({ message: 'Remove this VN?', tone: 'danger' });
 *   if (!ok) return;
 *
 * For typing-to-confirm flows (DB wipes etc.), pass `requireTyping`:
 *   await confirm({ message: 'Wipe the whole DB?', requireTyping: 'WIPE' });
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedEntry[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const confirm = useCallback<ConfirmApi['confirm']>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        const id = nextId++;
        setQueue((prev) => [...prev, { ...opts, id, kind: 'confirm', resolve }]);
      }),
    [],
  );

  const prompt = useCallback<ConfirmApi['prompt']>(
    (opts) =>
      new Promise<string | null>((resolve) => {
        const id = nextId++;
        setQueue((prev) => [...prev, { ...opts, id, kind: 'prompt', resolve }]);
      }),
    [],
  );

  const api = useMemo<ConfirmApi>(() => ({ confirm, prompt }), [confirm, prompt]);
  const current = queue[0] ?? null;

  function closeConfirm(ok: boolean) {
    if (!current || current.kind !== 'confirm') return;
    current.resolve(ok);
    setQueue((prev) => prev.slice(1));
  }

  function closePrompt(value: string | null) {
    if (!current || current.kind !== 'prompt') return;
    current.resolve(value);
    setQueue((prev) => prev.slice(1));
  }

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {mounted &&
        current &&
        createPortal(
          current.kind === 'confirm' ? (
            <ConfirmDialog key={current.id} entry={current} onClose={closeConfirm} />
          ) : (
            <PromptDialog key={current.id} entry={current} onClose={closePrompt} />
          ),
          document.body,
        )}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  entry,
  onClose,
}: {
  entry: Extract<QueuedEntry, { kind: 'confirm' }>;
  onClose: (ok: boolean) => void;
}) {
  const t = useT();
  const [typed, setTyped] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  // Focus management: remember the element that had focus, move focus
  // to the confirm button on open, restore on close. ESC + outside-
  // click both dismiss as a cancel.
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    confirmBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose(false);
        return;
      }
      // Trap Tab inside the dialog.
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (
        previouslyFocused.current &&
        previouslyFocused.current instanceof HTMLElement &&
        document.contains(previouslyFocused.current)
      ) {
        previouslyFocused.current.focus();
      }
    };
  }, [onClose]);

  const needsTyping = !!entry.requireTyping;
  const typingOk = !needsTyping || typed === entry.requireTyping;
  const danger = entry.tone === 'danger';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-body"
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={() => onClose(false)}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-t-2xl border border-border bg-bg-card shadow-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2
            id="confirm-dialog-title"
            className={`inline-flex items-center gap-2 text-sm font-bold ${
              danger ? 'text-status-dropped' : 'text-white'
            }`}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {entry.title ?? t.common.confirmTitle}
          </h2>
          <button
            type="button"
            onClick={() => onClose(false)}
            aria-label={t.common.close}
            className="rounded text-muted hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <p
          id="confirm-dialog-body"
          className="whitespace-pre-wrap px-4 py-3 text-sm text-white/90"
        >
          {entry.message}
        </p>
        {needsTyping && (
          <div className="px-4 pb-3">
            <label className="block text-xs text-muted">
              {t.common.confirmTypeHint.replace('{token}', entry.requireTyping ?? '')}
            </label>
            <input
              autoFocus
              className="input mt-1 w-full"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label={t.common.confirmTypeHint.replace('{token}', entry.requireTyping ?? '')}
            />
          </div>
        )}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="btn"
          >
            {entry.cancelLabel ?? t.common.cancel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            disabled={!typingOk}
            onClick={() => onClose(true)}
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'} disabled:opacity-50`}
          >
            {entry.confirmLabel ?? t.common.confirm}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Styled `window.prompt` replacement. Submits on Enter, dismisses on
 * ESC / Cancel / backdrop. Mirrors ConfirmDialog's a11y wiring (role,
 * focus trap, return focus). Validator runs on each keystroke.
 */
function PromptDialog({
  entry,
  onClose,
}: {
  entry: Extract<QueuedEntry, { kind: 'prompt' }>;
  onClose: (value: string | null) => void;
}) {
  const t = useT();
  const [value, setValue] = useState(entry.initial ?? '');
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    inputRef.current?.focus();
    inputRef.current?.select();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose(null);
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (
        previouslyFocused.current &&
        previouslyFocused.current instanceof HTMLElement &&
        document.contains(previouslyFocused.current)
      ) {
        previouslyFocused.current.focus();
      }
    };
  }, [onClose]);

  const validationError = entry.validate ? entry.validate(value) : null;
  const canSubmit = !validationError;

  function submit() {
    if (!canSubmit) return;
    onClose(value.trim());
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-dialog-title"
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={() => onClose(null)}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-t-2xl border border-border bg-bg-card shadow-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id="prompt-dialog-title" className="text-sm font-bold text-white">
            {entry.title ?? entry.message ?? t.common.confirmTitle}
          </h2>
          <button
            type="button"
            onClick={() => onClose(null)}
            aria-label={t.common.close}
            className="rounded text-muted hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {entry.message && entry.title && (
            <p className="px-4 pt-3 text-sm text-white/90">{entry.message}</p>
          )}
          <div className="px-4 py-3">
            <input
              ref={inputRef}
              className={`input w-full ${
                validationError ? 'border-status-dropped ring-1 ring-status-dropped' : ''
              }`}
              value={value}
              placeholder={entry.placeholder ?? ''}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={!!validationError || undefined}
              aria-describedby={validationError ? 'prompt-dialog-error' : undefined}
            />
            {validationError && (
              <p id="prompt-dialog-error" className="mt-1 text-[11px] text-status-dropped">
                {validationError}
              </p>
            )}
          </div>
          <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={() => onClose(null)}
              className="btn"
            >
              {entry.cancelLabel ?? t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn btn-primary disabled:opacity-50"
            >
              {entry.confirmLabel ?? t.common.confirm}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

export function useConfirm(): ConfirmApi {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
