'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface ToastEntry {
  id: number;
  kind: ToastKind;
  message: string;
  /** ms — defaults to 3500 (success/info) or 6000 (error). 0 = sticky. */
  duration?: number;
}

interface ToastApi {
  push: (kind: ToastKind, message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  /**
   * Yellow-tone toast used for "operation succeeded but the data
   * is stale" situations — e.g. a refresh that fell back to the
   * cache because VNDB was unreachable. Distinct from `error` so
   * the user doesn't read it as a hard failure.
   */
  warning: (message: string, duration?: number) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const map = timerRef.current;
    return () => {
      for (const tid of map.values()) clearTimeout(tid);
      map.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    const tid = timerRef.current.get(id);
    if (tid !== undefined) {
      clearTimeout(tid);
      timerRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, duration?: number) => {
      const id = nextId++;
      const entry: ToastEntry = { id, kind, message, duration };
      setToasts((prev) => [...prev, entry]);
      const ms = duration ?? (kind === 'error' ? 6000 : 3500);
      if (ms > 0) {
        const tid = setTimeout(() => {
          timerRef.current.delete(id);
          dismiss(id);
        }, ms);
        timerRef.current.set(id, tid);
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (m, d) => push('success', m, d),
      error: (m, d) => push('error', m, d),
      info: (m, d) => push('info', m, d),
      warning: (m, d) => push('warning', m, d),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 bottom-16 z-[1100] flex flex-col items-center gap-2 px-4 sm:bottom-12"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            aria-live="polite"
            aria-atomic="false"
          >
            {toasts.map((t) => (
              <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastEntry; onDismiss: () => void }) {
  const t = useT();
  const tone =
    toast.kind === 'success'
      ? 'border-status-completed/60 bg-status-completed/15 text-status-completed'
      : toast.kind === 'error'
        ? 'border-status-dropped/60 bg-status-dropped/15 text-status-dropped'
        : toast.kind === 'warning'
          ? 'border-status-on_hold/60 bg-status-on_hold/15 text-status-on_hold'
          : 'border-border bg-bg-card text-white';
  const Icon =
    toast.kind === 'success'
      ? CheckCircle2
      : toast.kind === 'error' || toast.kind === 'warning'
        ? AlertTriangle
        : Info;
  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex max-w-[min(92vw,420px)] items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-card backdrop-blur ${tone} animate-in fade-in slide-in-from-bottom-2`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1 whitespace-pre-wrap">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        // R6-UX user feedback: the dismiss button used hard 44px
        // min-width/min-height utilities to satisfy the WCAG-AA
        // touch target, but that forced the whole toast to 44px
        // tall and left a fat empty band below the 16px icon +
        // single-line text. The `.tap-target` utility provides the
        // same ±10px invisible hit area through a CSS pseudo-
        // element without bloating the chrome. `items-center`
        // keeps the icon + text + close baseline-aligned on one
        // row. (tests/toast-no-empty-bottom-space.test.ts pins
        // both the alignment and the absence of the legacy hard
        // sizing).
        className="tap-target ml-1 inline-flex shrink-0 items-center justify-center rounded p-0.5 text-muted hover:text-white"
        aria-label={t.common.dismiss}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
