'use client';
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  EyeOff,
  MoreVertical,
  RotateCcw,
} from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import type { SectionLayoutV1, SectionState } from '@/lib/section-layout';

/**
 * Shared per-section wrapper for the app-wide section-ordering
 * system (item 15). Drops onto staff / character / producer detail
 * pages — the VN / series pages already have their own bespoke
 * dnd-kit editor and don't need this one.
 *
 * Minimum controls per spec:
 *   - hide / show
 *   - collapsed / expanded default
 *   - reorder via up / down buttons (drag-and-drop is intentionally
 *     not used here — the operator explicitly accepted "Order
 *     controls using up/down buttons or dnd-kit" so we ship the
 *     simpler accessible variant on these less-customized pages)
 *   - reset (rendered from a sibling chip on the page header)
 *
 * The wrapper sets `aria-expanded` on the toggle, hides body via
 * conditional rendering so collapsed sections don't ship their
 * children. Hidden sections render nothing at all (no header) —
 * the operator's "Page layout / sections" Settings panel is the
 * single place to restore them.
 */

interface Props<Id extends string> {
  scope: 'staff' | 'character' | 'producer';
  sectionId: Id;
  layout: SectionLayoutV1<Id>;
  /**
   * Localized section title. Rendered as the header text + appended
   * to the controls' aria-labels so screen readers can tell sibling
   * sections apart.
   */
  title: string;
  /**
   * Optional anchor id placed on the section wrapper so deep-links
   * from elsewhere in the app can jump straight to this block.
   */
  anchor?: string;
  children: React.ReactNode;
  /**
   * `true` keeps the header chrome inside the same card; `false`
   * (default) renders header + body as a `<section>` block with the
   * project's standard `mt-6 rounded-2xl bg-bg-card …` chrome so
   * the wrapper drops in alongside existing content without
   * needing a per-page restyle.
   */
  embedded?: boolean;
}

const SETTINGS_KEY_BY_SCOPE = {
  staff: 'staff_detail_section_layout_v1',
  character: 'character_detail_section_layout_v1',
  producer: 'producer_detail_section_layout_v1',
} as const;

const EVENT_BY_SCOPE = {
  staff: 'staff:detail-layout-changed',
  character: 'character:detail-layout-changed',
  producer: 'producer:detail-layout-changed',
} as const;

export function DetailSectionFrame<Id extends string>({
  scope,
  sectionId,
  layout,
  title,
  anchor,
  children,
  embedded = false,
}: Props<Id>) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const sectionsState = layout.sections;
  const [state, setState] = useState<SectionState>(
    sectionsState[sectionId] ?? { visible: true, collapsedByDefault: false },
  );
  const [order, setOrder] = useState<Id[]>(layout.order);
  const [busy, setBusy] = useState(false);

  // Keep local state in sync with server-rendered prop change
  // (router.refresh path).
  useEffect(() => {
    const incoming = sectionsState[sectionId];
    if (incoming) setState(incoming);
  }, [sectionsState, sectionId]);
  useEffect(() => {
    setOrder(layout.order);
  }, [layout.order]);

  // Subscribe to sibling-section changes (one section hides itself
  // → other sections may reorder above/below the gap).
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (
        e as CustomEvent<{
          sections?: Partial<Record<string, SectionState>>;
          order?: string[];
        }>
      ).detail;
      if (!detail) return;
      if (detail.sections && detail.sections[sectionId]) {
        setState(detail.sections[sectionId]!);
      }
      if (Array.isArray(detail.order)) {
        setOrder(detail.order as Id[]);
      }
    }
    const eventName = EVENT_BY_SCOPE[scope];
    window.addEventListener(eventName, onChange);
    return () => window.removeEventListener(eventName, onChange);
  }, [scope, sectionId]);

  const persist = useCallback(
    async (next: Partial<SectionState>, orderOverride?: Id[]) => {
      const prev = state;
      const merged = { ...prev, ...next };
      setBusy(true);
      setState(merged);
      try {
        const r = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            [SETTINGS_KEY_BY_SCOPE[scope]]: {
              sections: { [sectionId]: merged },
              ...(orderOverride ? { order: orderOverride } : {}),
            },
          }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        window.dispatchEvent(
          new CustomEvent(EVENT_BY_SCOPE[scope], {
            detail: {
              sections: { [sectionId]: merged },
              ...(orderOverride ? { order: orderOverride } : {}),
            },
          }),
        );
        startTransition(() => router.refresh());
      } catch (e) {
        setState(prev);
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [state, scope, sectionId, t.common.error, toast, router],
  );

  const move = useCallback(
    (direction: 'up' | 'down') => {
      const idx = order.indexOf(sectionId);
      if (idx === -1) return;
      const next = [...order];
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= next.length) return;
      [next[idx], next[target]] = [next[target], next[idx]];
      setOrder(next);
      void persist(state, next);
    },
    [order, sectionId, state, persist],
  );

  if (!state.visible) return null;
  const collapsed = state.collapsedByDefault;
  const idx = order.indexOf(sectionId);
  const canMoveUp = idx > 0;
  const canMoveDown = idx >= 0 && idx < order.length - 1;
  const wrapperClass = embedded
    ? 'mt-4'
    : 'mt-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6';

  return (
    <section
      id={anchor}
      data-section-id={sectionId}
      data-section-scope={scope}
      data-section-collapsed={collapsed ? 'true' : 'false'}
      className={wrapperClass}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          {title}
        </h2>
        <SectionControls
          busy={busy}
          collapsed={collapsed}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          sectionLabel={title}
          onToggleCollapse={() => void persist({ collapsedByDefault: !collapsed })}
          onMoveUp={() => move('up')}
          onMoveDown={() => move('down')}
          onHide={() => void persist({ visible: false })}
        />
      </header>
      {!collapsed && <div>{children}</div>}
    </section>
  );
}

function SectionControls({
  busy,
  collapsed,
  canMoveUp,
  canMoveDown,
  sectionLabel,
  onToggleCollapse,
  onMoveUp,
  onMoveDown,
  onHide,
}: {
  busy: boolean;
  collapsed: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  sectionLabel: string;
  onToggleCollapse: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onHide: () => void;
}) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

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

  const dict = t.sectionLayout;
  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={busy || !canMoveUp}
        aria-label={`${dict.moveUp} — ${sectionLabel}`}
        title={`${dict.moveUp} — ${sectionLabel}`}
        className="tap-target-tight inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white disabled:opacity-30"
      >
        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={busy || !canMoveDown}
        aria-label={`${dict.moveDown} — ${sectionLabel}`}
        title={`${dict.moveDown} — ${sectionLabel}`}
        className="tap-target-tight inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white disabled:opacity-30"
      >
        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onToggleCollapse}
        disabled={busy}
        aria-expanded={!collapsed}
        aria-label={collapsed ? `${dict.expand} — ${sectionLabel}` : `${dict.collapse} — ${sectionLabel}`}
        title={collapsed ? `${dict.expand} — ${sectionLabel}` : `${dict.collapse} — ${sectionLabel}`}
        className="tap-target-tight inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white disabled:opacity-50"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
      </button>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        aria-label={`${dict.menuLabel} — ${sectionLabel}`}
        title={`${dict.menuLabel} — ${sectionLabel}`}
        className="tap-target-tight inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white disabled:opacity-50"
      >
        <MoreVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label={`${dict.menuLabel} — ${sectionLabel}`}
          className="absolute right-0 top-full z-30 mt-1 w-44 rounded-md border border-border bg-bg-card p-1 text-xs shadow-card"
        >
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
            <span>{dict.hide}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Page-level reset chip — restores the canonical default layout for
 * this scope (every section visible, expanded, in canonical order).
 * The operator can drop it next to the page title; we don't auto-
 * mount it because each detail page composes its own header.
 */
export function DetailSectionResetButton({
  scope,
}: {
  scope: 'staff' | 'character' | 'producer';
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const onReset = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [SETTINGS_KEY_BY_SCOPE[scope]]: null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      window.dispatchEvent(
        new CustomEvent(EVENT_BY_SCOPE[scope], { detail: { reset: true } }),
      );
      startTransition(() => router.refresh());
      toast.success(t.sectionLayout.resetDone);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [scope, t.common.error, t.sectionLayout.resetDone, toast, router]);

  return (
    <button
      type="button"
      onClick={onReset}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
      title={t.sectionLayout.resetTitle}
    >
      <RotateCcw className="h-3 w-3" aria-hidden /> {t.sectionLayout.reset}
    </button>
  );
}
