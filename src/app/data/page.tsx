import Link from 'next/link';
import { Database, Download, FileJson, FileUp, HardDrive } from 'lucide-react';
import { getDict } from '@/lib/i18n/server';
import { ImportPanel } from '@/components/ImportPanel';

export const dynamic = 'force-dynamic';

export default async function DataPage() {
  const t = await getDict();
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex items-center gap-3">
        <Database className="h-7 w-7 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold">{t.dataMgmt.title}</h1>
          <p className="text-sm text-muted">{t.dataMgmt.subtitle}</p>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-bg-card p-6">
        <h2 className="mb-2 text-base font-bold">{t.dataMgmt.exportSectionTitle}</h2>
        <p className="mb-4 text-xs text-muted">{t.dataMgmt.exportSectionHint}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/api/collection/export" className="btn" download>
            <FileJson className="h-4 w-4" /> {t.dataMgmt.exportJson}
          </Link>
          <Link href="/api/backup" className="btn" download>
            <HardDrive className="h-4 w-4" /> {t.dataMgmt.backupDb}
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
          <FileUp className="h-5 w-5 text-accent" /> {t.dataMgmt.importSectionTitle}
        </h2>
        <p className="mb-4 text-xs text-muted">{t.dataMgmt.importHint}</p>
        <ImportPanel />
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
          <Download className="h-5 w-5 text-accent" /> {t.dataMgmt.assetsSectionTitle}
        </h2>
        <p className="mb-3 text-xs text-muted">{t.dataMgmt.assetsSectionHint}</p>
        <p className="text-xs text-muted">
          → <Link href="/" className="text-accent hover:underline">{t.dataMgmt.bulkLinkHint}</Link>
        </p>
      </section>
    </div>
  );
}
