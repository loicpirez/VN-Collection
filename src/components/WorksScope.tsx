'use client';

import { Children, createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { PaginatedGrid } from './PaginatedGrid';

type Scope = 'all' | 'collection';
const WorksScopeContext = createContext<{ scope: Scope; select?: (scope: Scope) => void }>({ scope: 'all' });

/**
 * Filters already loaded credits without requesting another server render.
 * @param props Initial URL scope and the complete credit content.
 * @returns Credit scope context with Back/Forward synchronization.
 */
export function WorksScopeProvider({ initialScope, children }: { initialScope: Scope; children: ReactNode }) {
  const [scope, setScope] = useState(initialScope);
  useEffect(() => {
    const onPopState = () => setScope(new URLSearchParams(window.location.search).get('scope') === 'collection' ? 'collection' : 'all');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => { setScope(initialScope); }, [initialScope]);
  function select(next: Scope) {
    if (next === scope) return;
    const url = new URL(window.location.href);
    if (next === 'collection') url.searchParams.set('scope', next);
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
export function WorksScopeLink({ scope, href, children, className }: { scope: Scope; href: string; children: ReactNode; className?: string }) {
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
export function WorksScopeGrid({ owned, children, resetKey, ...props }: ComponentProps<typeof PaginatedGrid> & { owned: readonly boolean[] }) {
  const { scope } = useContext(WorksScopeContext);
  const rows = Children.toArray(children);
  return <PaginatedGrid {...props} resetKey={`${resetKey}:${scope}`}>{scope === 'all' ? rows : rows.filter((_, index) => owned[index])}</PaginatedGrid>;
}

/**
 * Omits a credit section that has no owned rows in collection scope.
 * @param props Owned row count and the section content.
 * @returns The visible section, or no markup for an empty collection section.
 */
export function WorksScopeSection({ ownedCount, children }: { ownedCount: number; children: ReactNode }) {
  const { scope } = useContext(WorksScopeContext);
  return scope === 'collection' && ownedCount === 0 ? null : children;
}

/**
 * Displays scope-specific counts or an empty-collection message.
 * @param props All/owned counts and optional collection-only empty content.
 * @returns The active count, or the collection-only empty content.
 */
export function WorksScopeCount({ all, owned, empty }: { all: number; owned: number; empty?: ReactNode }) {
  const { scope } = useContext(WorksScopeContext);
  if (empty !== undefined) return scope === 'collection' && owned === 0 ? empty : null;
  return scope === 'collection' ? owned : all;
}
