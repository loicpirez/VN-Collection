import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FileCode2, RefreshCw } from 'lucide-react';
import { getSchema } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { SchemaBrowser } from '@/components/SchemaBrowser';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.schemaPage.pageTitle };
}

/**
 * Browser for VNDB's `/schema` endpoint. VNDB exposes a single big JSON
 * blob with every enum / lookup table the API depends on — language
 * codes, platforms, release types, staff roles, content tags, length
 * grades, devstatus values, extlink definitions, and so on. We always
 * fetched it for cache freshness; this page finally renders it so the
 * user can answer questions like "what platform codes does VNDB
 * actually support" without leaving the app.
 */
export default async function SchemaPage() {
  const t = await getDict();
  let schema: unknown = null;
  let error: string | null = null;
  try {
    schema = await getSchema();
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/data" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" /> {t.nav.data}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <FileCode2 className="h-6 w-6 text-accent" aria-hidden /> {t.schemaPage.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.schemaPage.pageSubtitle}</p>
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted/80">
          <RefreshCw className="h-3 w-3" aria-hidden /> {t.schemaPage.cacheHint}
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-status-dropped/50 bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </p>
      ) : (
        <SchemaBrowser schema={schema} />
      )}
    </div>
  );
}
