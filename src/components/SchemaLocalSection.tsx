import { Database } from 'lucide-react';
import { listLocalSqliteSchema } from '@/lib/schema-local';
import { getDict } from '@/lib/i18n/server';

export async function SchemaLocalSection() {
  const t = await getDict();
  const tables = listLocalSqliteSchema();
  return (
    <section className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
      <h2 className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted">
        <Database className="h-4 w-4 text-accent" aria-hidden /> {t.schemaLocal.heading}
      </h2>
      <p className="mt-1 text-xs text-muted">{t.schemaLocal.sub}</p>
      <div className="mt-4 space-y-3">
        {tables.map((table) => (
          <details key={table.name} className="rounded-lg border border-border bg-bg-elev/30">
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
              {table.name} <span className="text-xs font-normal text-muted">({table.columns.length})</span>
            </summary>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-bg/60 text-muted">
                  <tr>
                    <th className="px-3 py-2">{t.schemaLocal.column}</th>
                    <th className="px-3 py-2">{t.schemaLocal.type}</th>
                    <th className="px-3 py-2">{t.schemaLocal.required}</th>
                    <th className="px-3 py-2">{t.schemaLocal.primaryKey}</th>
                    <th className="px-3 py-2">{t.schemaLocal.defaultValue}</th>
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

