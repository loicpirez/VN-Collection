import { Database } from 'lucide-react';
import { getDatabaseSchemaSnapshot } from '@/lib/schema-local';
import { getDict } from '@/lib/i18n/server';
import { CollapsibleSummary } from './CollapsibleSummary';

export async function SchemaLocalSection() {
  const t = await getDict();
  const snapshot = await getDatabaseSchemaSnapshot();
  const poolSummary = snapshot.pool
    ? t.schemaLocal.poolSummary
      .replace('{total}', String(snapshot.pool.total))
      .replace('{max}', String(snapshot.pool.max))
      .replace('{idle}', String(snapshot.pool.idle))
      .replace('{waiting}', String(snapshot.pool.waiting))
    : t.schemaLocal.notApplicable;
  return (
    <section className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
      <h2 className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted">
        <Database className="h-4 w-4 text-accent" aria-hidden /> {t.schemaLocal.heading}
      </h2>
      <p className="mt-1 text-xs text-muted">{t.schemaLocal.sub}</p>
      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-md border border-border bg-bg-elev/30 px-3 py-2">
          <dt className="text-muted">{t.schemaLocal.backend}</dt>
          <dd className="mt-0.5 font-semibold text-white">{snapshot.backend === 'postgres' ? 'PostgreSQL' : 'SQLite'}</dd>
        </div>
        <div className="rounded-md border border-border bg-bg-elev/30 px-3 py-2">
          <dt className="text-muted">{t.schemaLocal.migrationVersion}</dt>
          <dd className="mt-0.5 font-mono text-white">{snapshot.migrationVersion ?? t.schemaLocal.notApplicable}</dd>
        </div>
        <div className="rounded-md border border-border bg-bg-elev/30 px-3 py-2">
          <dt className="text-muted">{t.schemaLocal.pool}</dt>
          <dd className="mt-0.5 text-white">{poolSummary}</dd>
        </div>
      </dl>
      <div className="mt-4 space-y-3">
        {snapshot.tables.map((table) => (
          <details key={table.name} className="group rounded-lg border border-border bg-bg-elev/30">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center px-3 py-2 text-sm font-semibold can-hover:sm:min-h-0 [&::-webkit-details-marker]:hidden">
              <CollapsibleSummary>
                {table.name} <span className="text-xs font-normal text-muted">({table.columns.length})</span>
              </CollapsibleSummary>
            </summary>
            <div className="scroll-fade-right overflow-x-auto border-t border-border">
              <table className="w-full min-w-[560px] text-left text-xs" aria-label={table.name}>
                <thead className="bg-bg/60 text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2">{t.schemaLocal.column}</th>
                    <th scope="col" className="px-3 py-2">{t.schemaLocal.type}</th>
                    <th scope="col" className="px-3 py-2">{t.schemaLocal.required}</th>
                    <th scope="col" className="px-3 py-2">{t.schemaLocal.primaryKey}</th>
                    <th scope="col" className="px-3 py-2">{t.schemaLocal.defaultValue}</th>
                  </tr>
                </thead>
                <tbody>
                  {table.columns.map((col) => (
                    <tr key={col.name} className="border-t border-border/60">
                      <td className="px-3 py-2 font-mono text-white">{col.name}</td>
                      <td className="px-3 py-2 font-mono text-muted">{col.type || '-'}</td>
                      <td className="px-3 py-2">{col.notnull ? t.common.yes : t.common.no}</td>
                      <td className="px-3 py-2">{col.pk ? t.common.yes : t.common.no}</td>
                      <td className="px-3 py-2 font-mono text-muted">{col.dflt_value ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
