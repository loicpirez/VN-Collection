'use client';

import { Children, createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { PaginatedGrid } from './PaginatedGrid';
import { parseWorksScope, type WorksScope } from '@/lib/works-scope';

const WorksScopeContext = createContext<{ scope: WorksScope; select?: (scope: WorksScope) => void }>({ scope: 'all' });

/**
 * Filters already loaded credits without requesting another server render.
 * @param props Initial URL scope and the complete credit content.
 * @returns Credit scope context with Back/Forward synchronization.
 */
export function WorksScopeProvider({ initialScope, children }: { initialScope: WorksScope; children: ReactNode }) {
  const [scope, setScope] = useState(initialScope);
  useEffect(() => {
    const onPopState = () => setScope(parseWorksScope(new URLSearchParams(window.location.search).get('scope')));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => { setScope(initialScope); }, [initialScope]);
  function select(next: WorksScope) {
    if (next === scope) return;
    const url = new URL(window.location.href);
    if (next !== 'all') url.searchParams.set('scope', next);
    else url.searchParams.delete('scope');
    window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
    setScope(next);
  }
  return <WorksScopeContext.Provider value={{ scope, select }}>{children}</WorksScopeContext.Provider>;
}

/**
 * Preserves normal link behavior while making an unmodified scope click local.
 * @param props Destination scope, fallback URL, and existing presentation.
 * @returns An accessible link showing the active scope.
 */
export function WorksScopeLink({ scope, href, children, className }: { scope: WorksScope; href: string; children: ReactNode; className?: string }) {
  const context = useContext(WorksScopeContext);
  const active = context.scope === scope;
  return <a href={href} aria-current={active ? 'page' : undefined}
    className={`${className ?? 'inline-flex min-h-[44px] items-center rounded-md border px-3 py-1.5 text-xs font-semibold'} ${active ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted hover:text-white'}`}
    onClick={(event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !context.select) return;
      event.preventDefault();
      context.select(scope);
    }}>{children}</a>;
}

/**
 * Filters credit rows before pagination so hidden rows never consume a page.
 * @param props Complete rows, matching ownership flags, and pagination settings.
 * @returns The current scope's bounded page of cards.
 */
export function WorksScopeGrid({ owned, sold, children, resetKey, ...props }: ComponentProps<typeof PaginatedGrid> & {
  owned: readonly boolean[];
  sold?: readonly boolean[];
}) {
  const { scope } = useContext(WorksScopeContext);
  const rows = Children.toArray(children);
  const flags = scope === 'sold' ? sold : owned;
  return <PaginatedGrid {...props} resetKey={`${resetKey}:${scope}`}>{scope === 'all' ? rows : rows.filter((_, index) => flags?.[index])}</PaginatedGrid>;
}

/**
 * Omits a credit section that has no rows in the selected collection scope.
 * @param props Scoped row counts and the section content.
 * @returns The visible section, or no markup for an empty scoped section.
 */
export function WorksScopeSection({ ownedCount, soldCount = 0, children }: { ownedCount: number; soldCount?: number; children: ReactNode }) {
  const { scope } = useContext(WorksScopeContext);
  const count = scope === 'sold' ? soldCount : ownedCount;
  return scope === 'all' || count > 0 ? children : null;
}

/**
 * Displays the current scope's count or its empty message.
 * @param props Counts and optional empty messages for collection and sold scopes.
 * @returns The current count, matching empty content, or no markup.
 */
export function WorksScopeCount({ all, owned, sold = 0, empty, emptySold }: {
  all: number;
  owned: number;
  sold?: number;
  empty?: ReactNode;
  emptySold?: ReactNode;
}) {
  const { scope } = useContext(WorksScopeContext);
  const count = { all, collection: owned, sold }[scope];
  if (empty === undefined && emptySold === undefined) return count;
  if (scope === 'all' || count > 0) return null;
  return scope === 'sold' ? emptySold ?? empty : empty;
}
