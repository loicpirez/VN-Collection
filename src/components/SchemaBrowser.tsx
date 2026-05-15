'use client';

import { useMemo, useState } from 'react';
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
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();

  const topKeys = useMemo(() => {
    if (!schema || typeof schema !== 'object') return [] as string[];
    return Object.keys(schema as Record<string, unknown>).sort();
  }, [schema]);

  return (
    <div className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
      <label className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-bg px-2 py-1.5 text-sm">
        <Search className="h-4 w-4 text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
              filter={trimmed}
              forceOpen={trimmed.length > 0 && matches(k, (schema as Record<string, unknown>)[k], trimmed)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Node({
  k,
  v,
  depth,
  filter,
  forceOpen,
}: {
  k: string;
  v: unknown;
  depth: number;
  filter: string;
  forceOpen: boolean;
}) {
  const [openLocal, setOpenLocal] = useState(false);
  const open = openLocal || forceOpen || depth === 0 && filter.length > 0;
  const isObject = v !== null && typeof v === 'object';
  const indent = { paddingLeft: `${depth * 14}px` };

  if (filter && !matches(k, v, filter) && !hasMatchingDescendant(v, filter, 4)) {
    return null;
  }

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
              filter={filter}
              forceOpen={false}
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

function matches(k: string, v: unknown, filter: string): boolean {
  if (k.toLowerCase().includes(filter)) return true;
  if (typeof v === 'string') return v.toLowerCase().includes(filter);
  if (typeof v === 'number') return String(v).includes(filter);
  return false;
}

function hasMatchingDescendant(v: unknown, filter: string, depthBudget: number): boolean {
  if (depthBudget <= 0) return false;
  if (v === null || typeof v !== 'object') return false;
  const entries = Array.isArray(v) ? v.entries() : Object.entries(v as Record<string, unknown>);
  for (const [k, child] of entries) {
    if (matches(String(k), child, filter)) return true;
    if (hasMatchingDescendant(child, filter, depthBudget - 1)) return true;
  }
  return false;
}
