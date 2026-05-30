'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Per-section count reporter. Lazy sections (characters / releases /
 * quotes / relations) only know their item count after the data
 * resolves, yet the count badge belongs in the section header which
 * the frame now owns. A child calls `useSectionCount(n)` to surface
 * its count as the `· n` badge next to the frame title; calling it
 * with `null` clears the badge. No-op outside a frame.
 */
const SectionCountContext = createContext<((count: number | null) => void) | null>(null);

/**
 * Report a section's item count to the enclosing `DetailSectionFrame`
 * so it renders as the muted `· n` badge beside the title. Pass `null`
 * (e.g. while loading or on error) to clear the badge.
 */
export function useSectionCount(count: number | null): void {
  const report = useContext(SectionCountContext);
  useEffect(() => {
    if (!report) return undefined;
    report(count);
    return () => report(null);
  }, [report, count]);
}

/**
 * Render-only adapter so server components can surface a static count
 * to the enclosing `DetailSectionFrame` header. Renders nothing.
 */
export function SectionCountReport({ count }: { count: number | null }) {
  useSectionCount(count);
  return null;
}

function storageKey(id: string): string {
  return `vn-section-collapsed:${id}`;
}

function readPersisted(id: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    // localStorage unavailable (private mode / SSR) — fall through.
  }
  return fallback;
}

interface Props {
  /** Section id — drives the persistence key and the `#section-<id>` anchor handled by the host. */
  id: string;
  /**
   * Header title. Empty string renders a header bar with only the
   * chevron toggle (+ actions) and no title text, for sections that
   * keep their own internal header to avoid a duplicate title.
   */
  title: string;
  /** Seed collapsed state on first visit, before any persisted preference exists. */
  defaultCollapsed: boolean;
  /** Optional controls rendered on the right of the header bar (links, buttons, badges). */
  actions?: ReactNode;
  children: ReactNode;
  /** Localized accessible label for the expand affordance. */
  expandLabel: string;
  /** Localized accessible label for the collapse affordance. */
  collapseLabel: string;
}

/**
 * Single collapsible frame shared by every customizable section on
 * `/vn/[id]`. Renders one `<h2>` header at the canonical muted-caps
 * style with a left chevron toggle, an optional `actions` node on the
 * right, and the body below. Collapsed state is per-section and
 * persisted across navigation in `localStorage` under
 * `vn-section-collapsed:<id>`, seeded from `defaultCollapsed`.
 *
 * The body is mounted only while expanded so heavy sections that
 * fetch on mount (characters / releases / quotes) stay lazy when the
 * section starts collapsed.
 */
export function DetailSectionFrame({
  id,
  title,
  defaultCollapsed,
  actions,
  children,
  expandLabel,
  collapseLabel,
}: Props) {
  const panelId = useId();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [count, setCount] = useState<number | null>(null);
  // Body mounts on first expansion and then stays mounted (hidden via
  // CSS while collapsed). This keeps the initial fetch of heavy
  // sections lazy when they start collapsed, yet avoids re-fetching
  // when the user re-expands a section they had collapsed.
  const [mounted, setMounted] = useState(!defaultCollapsed);

  useEffect(() => {
    const persisted = readPersisted(id, defaultCollapsed);
    setCollapsed(persisted);
    if (!persisted) setMounted(true);
  }, [id, defaultCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const target = `#section-${id}`;
    const reveal = () => {
      if (window.location.hash === target) {
        setCollapsed(false);
        setMounted(true);
      }
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [id]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (!next) setMounted(true);
      try {
        localStorage.setItem(storageKey(id), next ? '1' : '0');
      } catch {
        // Persistence is best-effort; the in-memory state still updates.
      }
      return next;
    });
  }, [id]);

  const reportCount = useCallback((value: number | null) => setCount(value), []);
  const expanded = !collapsed;
  const hasTitle = title.length > 0;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-bg-card">
      <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={mounted ? panelId : undefined}
          title={expanded ? collapseLabel : expandLabel}
          aria-label={hasTitle ? undefined : expanded ? collapseLabel : expandLabel}
          className="-mx-1 flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded px-1 text-left hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          )}
          {hasTitle && (
            <h2 className="inline-flex min-w-0 items-baseline gap-2 text-xs font-bold uppercase tracking-widest text-muted">
              <span className="truncate">{title}</span>
              {count != null && <span className="shrink-0 font-normal lowercase tracking-normal opacity-70">· {count}</span>}
            </h2>
          )}
        </button>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {mounted && (
        <div id={panelId} hidden={!expanded} className={expanded ? 'border-t border-border' : undefined}>
          <SectionCountContext.Provider value={reportCount}>{children}</SectionCountContext.Provider>
        </div>
      )}
    </section>
  );
}
