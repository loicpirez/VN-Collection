'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface Props {
  schema: unknown;
}

/**
 * Recursive JSON tree viewer for the VNDB `/schema` endpoint. The
 * payload is a single deep object: top-level keys group enums (e.g.
 * `enums.length`, `enums.platform`, `extlinks`, `api_fields.vn`),
 * each one a dict or an array. We render the tree collapsed by
 * default — clicking a node expands it. A free-text filter highlights
 * any node whose key OR value contains the query and auto-expands the
 * path leading to it, so "platform" jumps you straight to the platform
 * codes without scrolling through 200 lines of irrelevant config.
 */
export function SchemaBrowser({ schema }: Props) {
  const t = useT();
  const [rawQuery, setRawQuery] = useState('');
  // 150 ms debounce — VNDB's schema is large and the recursive match
  // walk runs on every keystroke. Debouncing keeps the input responsive
  // without dropping inputs the user typed.
  const [query, setQuery] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(rawQuery), 150);
    return () => window.clearTimeout(id);
  }, [rawQuery]);
  const trimmed = query.trim().toLowerCase();

  const topKeys = useMemo(() => {
    if (!schema || typeof schema !== 'object') return [] as string[];
    return Object.keys(schema as Record<string, unknown>).sort();
  }, [schema]);

  // One-shot walk that returns the set of node *paths* whose subtree
  // contains a match. Drives both visibility ("render this node") and
  // expansion ("auto-open this branch"). Built once per (schema,
  // filter) pair, then read with O(1) lookups during render. This
  // replaces the O(N²)-ish per-render `hasMatchingDescendant` calls.
  const visiblePaths = useMemo<Set<string> | null>(() => {
    if (!trimmed) return null;
    if (!schema || typeof schema !== 'object') return null;
    const set = new Set<string>();
    walkSchema(schema, '', trimmed, set);
    return set;
  }, [schema, trimmed]);

  return (
    <div className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
      <label className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-bg px-2 py-1.5 text-sm">
        <Search className="h-4 w-4 text-muted" aria-hidden />
        <input
          type="search"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder={t.schemaPage.filterPlaceholder}
          className="flex-1 bg-transparent outline-none"
        />
      </label>
      {topKeys.length === 0 ? (
        <p className="text-sm text-muted">{t.schemaPage.empty}</p>
      ) : (
        <ul className="space-y-1 font-mono text-xs">
          {topKeys.map((k) => (
            <Node
              key={k}
              k={k}
              v={(schema as Record<string, unknown>)[k]}
              depth={0}
              path={k}
              filter={trimmed}
              visiblePaths={visiblePaths}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * DFS marker: visits every node once and writes any path that
 * matches the filter (key or scalar value) into `out`. As it
 * unwinds, every ancestor path of a match is also added so the
 * tree-render can keep that branch open. Recursion depth is
 * bounded by the actual data (no `depthBudget` hack); modern
 * JS handles VNDB's schema fine.
 */
function walkSchema(v: unknown, path: string, filter: string, out: Set<string>): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v !== 'object') {
    if (matchesScalar(v, filter)) {
      if (path) out.add(path);
      return true;
    }
    return false;
  }
  const entries = Array.isArray(v)
    ? v.map((item, i) => [String(i), item] as const)
    : Object.entries(v as Record<string, unknown>);
  let any = false;
  for (const [k, child] of entries) {
    const childPath = path ? `${path}.${k}` : k;
    const keyMatched = k.toLowerCase().includes(filter);
    if (keyMatched) out.add(childPath);
    const childMatched = walkSchema(child, childPath, filter, out);
    if (keyMatched || childMatched) {
      any = true;
      out.add(childPath);
    }
  }
  if (any && path) out.add(path);
  return any;
}

function matchesScalar(v: unknown, filter: string): boolean {
  if (typeof v === 'string') return v.toLowerCase().includes(filter);
  if (typeof v === 'number') return String(v).includes(filter);
  return false;
}

function Node({
  k,
  v,
  depth,
  path,
  filter,
  visiblePaths,
}: {
  k: string;
  v: unknown;
  depth: number;
  path: string;
  filter: string;
  visiblePaths: Set<string> | null;
}) {
  const [openLocal, setOpenLocal] = useState(false);
  const hasFilter = filter.length > 0;
  // When filtering, the visiblePaths set tells us "this node has a
  // descendant matching the filter" → auto-expand and stay rendered.
  // Outside filtering, depth-0 nodes are still collapsed by default
  // and the user toggles them.
  const inMatchTree = hasFilter && visiblePaths?.has(path);
  const open = openLocal || !!inMatchTree;

  if (hasFilter && !inMatchTree) return null;

  const isObject = v !== null && typeof v === 'object';
  const indent = { paddingLeft: `${depth * 14}px` };

  if (!isObject) {
    return (
      <li className="text-muted" style={indent}>
        <KeyChip k={k} filter={filter} />{' '}
        <Value v={v} filter={filter} />
      </li>
    );
  }

  const entries = Array.isArray(v)
    ? v.map((item, i) => [String(i), item] as const)
    : Object.entries(v as Record<string, unknown>);

  return (
    <li style={indent}>
      <button
        type="button"
        onClick={() => setOpenLocal((o) => !o)}
        className="inline-flex items-center gap-1 text-left text-muted hover:text-white"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3 w-3" aria-hidden /> : <ChevronRight className="h-3 w-3" aria-hidden />}
        <KeyChip k={k} filter={filter} />
        <span className="text-[10px] text-muted/60">
          {Array.isArray(v) ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </button>
      {open && (
        <ul className="mt-0.5 space-y-1">
          {entries.map(([childK, childV]) => (
            <Node
              key={childK}
              k={childK}
              v={childV}
              depth={depth + 1}
              path={`${path}.${childK}`}
              filter={filter}
              visiblePaths={visiblePaths}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function KeyChip({ k, filter }: { k: string; filter: string }) {
  if (!filter) return <span className="font-bold text-white">{k}</span>;
  return <span className="font-bold text-white">{highlight(k, filter)}</span>;
}

function Value({ v, filter }: { v: unknown; filter: string }) {
  if (v === null) return <span className="text-muted/60">null</span>;
  if (typeof v === 'boolean') return <span className="text-accent">{String(v)}</span>;
  if (typeof v === 'number') return <span className="text-accent">{v}</span>;
  if (typeof v === 'string') {
    return <span className="text-status-completed">"{filter ? highlight(v, filter) : v}"</span>;
  }
  return <span className="text-muted/60">{String(v)}</span>;
}

function highlight(s: string, q: string): React.ReactNode {
  const idx = s.toLowerCase().indexOf(q);
  if (idx < 0) return s;
  return (
    <>
      {s.slice(0, idx)}
      <mark className="bg-accent/30 text-white">{s.slice(idx, idx + q.length)}</mark>
      {s.slice(idx + q.length)}
    </>
  );
}

