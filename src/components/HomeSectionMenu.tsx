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

import { readApiError } from '@/lib/api-error-read';
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
  const stateRef = useRef(state);
  const identityRef = useRef<HomeSectionId | null>(id);
  const inFlightRef = useRef(false);
  const mutationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const next = initialState ?? DEFAULT_HOME_LAYOUT.sections[id];
    identityRef.current = id;
    inFlightRef.current = false;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    stateRef.current = next;
    setState(next);
    setBusy(false);
    return () => {
      identityRef.current = null;
      inFlightRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [id, initialState]);

  // Pick up changes from elsewhere in the app (settings modal restoring
  // a hidden section, another strip's menu, ...).
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ reset?: boolean; sections?: Partial<Record<HomeSectionId, HomeSectionState>> }>).detail;
      if (!detail) return;
      if (detail.reset) {
        const next = DEFAULT_HOME_LAYOUT.sections[id];
        stateRef.current = next;
        setState(next);
        return;
      }
      const next = detail.sections?.[id];
      if (next) {
        stateRef.current = next;
        setState(next);
      }
    }
    window.addEventListener(HOME_LAYOUT_EVENT, onChange);
    return () => window.removeEventListener(HOME_LAYOUT_EVENT, onChange);
  }, [id]);

  const persist = useCallback(
    async (next: HomeSectionState) => {
      if (inFlightRef.current) return;
      const ownerId = id;
      const prev = stateRef.current;
      mutationAbortRef.current?.abort();
      const controller = new AbortController();
      mutationAbortRef.current = controller;
      inFlightRef.current = true;
      setBusy(true);
      stateRef.current = next;
      setState(next);
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
          signal: controller.signal,
        });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        if (identityRef.current !== ownerId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
        window.dispatchEvent(
          new CustomEvent(HOME_LAYOUT_EVENT, { detail: { sections: { [id]: next } } }),
        );
        startTransition(() => router.refresh());
      } catch (e) {
        if (identityRef.current !== ownerId || mutationAbortRef.current !== controller || controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
        stateRef.current = prev;
        setState(prev);
        toast.error((e as Error).message);
      } finally {
        if (identityRef.current === ownerId && mutationAbortRef.current === controller) {
          mutationAbortRef.current = null;
          inFlightRef.current = false;
          setBusy(false);
        }
      }
    },
    [id, t.common.error, toast, router],
  );

  const toggleCollapsed = useCallback(() => {
    const current = stateRef.current;
    void persist({ ...current, collapsed: !current.collapsed });
  }, [persist]);

  const hide = useCallback(() => {
    void persist({ ...stateRef.current, visible: false });
  }, [persist]);

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
  /**
   * Human-readable section name appended to the chevron + menu aria-
   * labels. Without it, four sibling strips ("Recently viewed",
   * "Reading queue", "Anniversary", "Library") render four identical
   * "Réduire" / "Options de la section" announcements — screen-reader
   * users cannot tell which strip they're on. Provide the section
   * title here.
   */
  sectionLabel?: string;
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
  sectionLabel,
}: ControlsProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Click-outside / Escape close the menu.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Focus first menuitem when menu opens.
  useEffect(() => {
    if (!menuOpen) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [menuOpen]);

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  }

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1">
      {(() => {
        // Compose section-specific aria-labels. Without
        // `sectionLabel`, fall back to the generic phrases so the
        // component is still safe to mount from older call sites.
        const collapseLabel = sectionLabel
          ? `${t.homeSections.collapse} — ${sectionLabel}`
          : t.homeSections.collapse;
        const expandLabel = sectionLabel
          ? `${t.homeSections.expand} — ${sectionLabel}`
          : t.homeSections.expand;
        const optionsLabel = sectionLabel
          ? `${t.homeSections.menuLabel} — ${sectionLabel}`
          : t.homeSections.menuLabel;
        return (
          <>
            <button
              type="button"
              onClick={onCollapseToggle}
              disabled={busy}
              aria-expanded={!state.collapsed}
              aria-label={state.collapsed ? expandLabel : collapseLabel}
              title={state.collapsed ? expandLabel : collapseLabel}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:text-white disabled:opacity-50"
            >
              {state.collapsed
                ? <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
            </button>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={busy}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={optionsLabel}
              title={optionsLabel}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:text-white disabled:opacity-50"
            >
              <MoreVertical className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        );
      })()}
      {menuOpen && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t.homeSections.menuLabel}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-30 mt-1 w-44 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-bg-card p-1 text-xs shadow-card"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onCollapseToggle();
            }}
            className="flex min-h-[44px] w-full items-center gap-2 rounded px-2 py-1.5 text-left text-muted hover:bg-bg-elev hover:text-white"
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
            className="flex min-h-[44px] w-full items-center gap-2 rounded px-2 py-1.5 text-left text-muted hover:bg-bg-elev hover:text-white"
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
              className="flex min-h-[44px] w-full items-center gap-2 rounded px-2 py-1.5 text-left text-status-dropped hover:bg-status-dropped/10"
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
