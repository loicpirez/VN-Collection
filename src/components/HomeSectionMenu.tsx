'use client';
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, EyeOff, MoreVertical, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import {
  DEFAULT_HOME_LAYOUT,
  HOME_LAYOUT_EVENT,
  type HomeSectionId,
  type HomeSectionState,
} from '@/lib/home-section-layout';

/**
 * Hook that wraps a home-page section's visibility / collapse state and
 * exposes setters that persist to `app_setting.home_section_layout_v1`
 * via `PATCH /api/settings`. Stays in sync with sibling subscribers via
 * a `vn:home-layout-changed` CustomEvent.
 *
 * Returns optimistic local state — the UI updates the instant the user
 * clicks; if the network call fails we revert and surface a toast.
 */
export function useHomeSection(id: HomeSectionId, initialState?: HomeSectionState) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, setState] = useState<HomeSectionState>(
    initialState ?? DEFAULT_HOME_LAYOUT.sections[id],
  );
  const [busy, setBusy] = useState(false);

  // Pick up changes from elsewhere in the app (settings modal restoring
  // a hidden section, another strip's menu, ...).
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ sections?: Partial<Record<HomeSectionId, HomeSectionState>> }>).detail;
      if (!detail) return;
      const next = detail.sections?.[id];
      if (next) setState(next);
    }
    window.addEventListener(HOME_LAYOUT_EVENT, onChange);
    return () => window.removeEventListener(HOME_LAYOUT_EVENT, onChange);
  }, [id]);

  const persist = useCallback(
    async (next: HomeSectionState) => {
      const prev = state;
      setBusy(true);
      setState(next); // optimistic
      try {
        // Patch only this section's state; the server validator merges
        // the partial layout against the persisted layout so other
        // sections + the order array stay intact.
        const r = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            home_section_layout_v1: { sections: { [id]: next } },
          }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        window.dispatchEvent(
          new CustomEvent(HOME_LAYOUT_EVENT, { detail: { sections: { [id]: next } } }),
        );
        startTransition(() => router.refresh());
      } catch (e) {
        setState(prev);
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    // `state` is intentionally not in deps — we capture the snapshot via
    // closure when called, and re-binding on every state change would
    // churn the controls' memoized handlers downstream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, t.common.error, toast, router],
  );

  const toggleCollapsed = useCallback(() => {
    void persist({ ...state, collapsed: !state.collapsed });
  }, [persist, state]);

  const hide = useCallback(() => {
    void persist({ ...state, visible: false });
  }, [persist, state]);

  return {
    state,
    busy,
    isHidden: !state.visible,
    isCollapsed: state.collapsed,
    toggleCollapsed,
    hide,
    persist,
  };
}

interface ControlsProps {
  state: HomeSectionState;
  busy: boolean;
  onCollapseToggle: () => void;
  onHide: () => void;
  /** Optional destructive action — e.g. "Clear recently-viewed history". */
  onClearData?: () => void;
  /** Label for the clear menu entry; falls back to the generic key. */
  clearLabel?: string;
}

/**
 * Small chevron-and-menu chip rendered in each home strip's header.
 * The strip owns the body conditional (`if (isCollapsed) ...`); this
 * component is purely the right-side controls.
 */
export function HomeSectionControls({
  state,
  busy,
  onCollapseToggle,
  onHide,
  onClearData,
  clearLabel,
}: ControlsProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside / Escape close the menu.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onCollapseToggle}
        disabled={busy}
        aria-expanded={!state.collapsed}
        aria-label={state.collapsed ? t.homeSections.expand : t.homeSections.collapse}
        title={state.collapsed ? t.homeSections.expand : t.homeSections.collapse}
        className="tap-target-tight inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white disabled:opacity-50"
      >
        {state.collapsed
          ? <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
      </button>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        aria-label={t.homeSections.menuLabel}
        title={t.homeSections.menuLabel}
        className="tap-target-tight inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white disabled:opacity-50"
      >
        <MoreVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label={t.homeSections.menuLabel}
          className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-border bg-bg-card p-1 text-xs shadow-card"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onCollapseToggle();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-muted hover:bg-bg-elev hover:text-white"
          >
            {state.collapsed
              ? <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
            {state.collapsed ? t.homeSections.expand : t.homeSections.collapse}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onHide();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-muted hover:bg-bg-elev hover:text-white"
          >
            <EyeOff className="h-3.5 w-3.5" aria-hidden />
            {t.homeSections.hide}
          </button>
          {onClearData && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onClearData();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-status-dropped hover:bg-status-dropped/10"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {clearLabel ?? t.homeSections.clearData}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
