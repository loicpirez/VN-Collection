import { Database, AlertTriangle } from 'lucide-react';
import { getSchemaEgsSummary, type SchemaEgsTableSummary } from '@/lib/schema-egs';
import { getDict } from '@/lib/i18n/server';

/**
 * EGS section block for `/schema`. Mirrors the visual shape of the
 * existing VNDB schema renderer — a heading, a short subtitle, and a
 * tile grid of one card per table with row count + last fetched
 * timestamp. A small "Stale-while-error" badge appears when the EGS
 * cover-resolver cache currently holds at least one stale fallback.
 *
 * Read-only on purpose. Mutations to EGS data happen through the
 * resolver (`resolveEgsForVn`), the manual mapping modals, or the
 * Settings panel; the schema page is for inspection only.
 */
function fmt(ts: number | null, neverLabel: string): string {
  if (!ts) return neverLabel;
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return neverLabel;
  }
}

export async function SchemaEgsSection() {
  const t = await getDict();
  const dict = t.schemaEgs;
  const summary = getSchemaEgsSummary();

  const labelFor = (table: SchemaEgsTableSummary): string => {
    switch (table.key) {
      case 'egs_game':
        return dict.tableEgsGame;
      case 'vndb_cache_egs':
        return dict.tableEgsCache;
      case 'vn_egs_link':
        return dict.tableVnEgsLink;
      case 'egs_vn_link':
        return dict.tableEgsVnLink;
    }
  };

  const isEmpty = summary.tables.every((t) => t.rowCount === 0) && !summary.egsUsernameSet;

  return (
    <section className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-bold">
            <Database className="h-5 w-5 text-accent" aria-hidden /> {dict.heading}
          </h2>
          <p className="mt-1 text-xs text-muted">{dict.sub}</p>
        </div>
        {summary.staleWhileError && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-status-on_hold/40 bg-status-on_hold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-on_hold"
            title={dict.staleWhileError}
          >
            <AlertTriangle className="h-3 w-3" aria-hidden /> {dict.staleWhileError}
          </span>
        )}
      </header>

      {isEmpty ? (
        <p className="rounded-md border border-border bg-bg-elev/40 p-4 text-xs text-muted">{dict.empty}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {summary.tables.map((table) => (
            <li
              key={table.key}
              className="rounded-lg border border-border bg-bg-elev/40 p-3 text-xs"
            >
              <div className="font-mono text-[11px] text-muted">{labelFor(table)}</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="font-semibold text-white">
                  {dict.rowCount.replace('{n}', String(table.rowCount))}
                </span>
                <span className="text-muted">
                  {dict.lastFetched}: {fmt(table.lastFetchedAt, dict.neverFetched)}
                </span>
              </div>
            </li>
          ))}
          <li className="rounded-lg border border-dashed border-border bg-bg-elev/20 p-3 text-xs sm:col-span-2">
            <div className="font-mono text-[11px] text-muted">{dict.settingsEgsUsername}</div>
            <div className="mt-1 text-muted">
              {summary.egsUsernameSet ? '✓' : '—'}
            </div>
          </li>
        </ul>
      )}
    </section>
  );
}
