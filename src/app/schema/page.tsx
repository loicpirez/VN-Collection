import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FileCode2, RefreshCw } from 'lucide-react';
import { getSchema } from '@/lib/vndb';
import { getCacheFreshness } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SchemaBrowser } from '@/components/SchemaBrowser';
import { SchemaEgsSection } from '@/components/SchemaEgsSection';
import { SchemaLocalSection } from '@/components/SchemaLocalSection';
import { RefreshScopeButton } from '@/components/RefreshScopeButton';

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

  // R5-058/R5-215: scope the freshness chip to the schema cache
  // ONLY (not authinfo / stats — those are unrelated to this page
  // and were inflating the chip's "Data Xh ago" reading). The
  // scoped refresh button below busts the same pattern so the
  // freshness display and the refresh action stay in sync.
  const lastUpdatedAt = getCacheFreshness(['% /schema|%']);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/data" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" /> {t.nav.data}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
              <FileCode2 className="h-6 w-6 text-accent" aria-hidden /> {t.schemaPage.pageTitle}
            </h1>
            <p className="mt-1 text-sm text-muted">{t.schemaPage.pageSubtitle}</p>
          </div>
          {/*
            Refresh button — previously the page copy claimed
            "click Refresh on this page to renew" but the button
            was never mounted. Either the copy was a lie or the
            button got removed in a refactor; the user-visible
            fix is to actually surface the control.
            R5-215: scoped to the `schema` cache only (not the
            full `/api/refresh/global` fan-out).
          */}
          <RefreshScopeButton scope="schema" lastUpdatedAt={lastUpdatedAt} />
        </div>
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted/80">
          <RefreshCw className="h-3 w-3" aria-hidden /> {t.schemaPage.cacheHint}
        </p>
      </header>

      <SchemaLocalSection />

      {/* EGS mirrored-data section — rendered above the VNDB browser so
          cache freshness and manual mappings are visible without
          pretending the counts are the remote EGS schema itself. */}
      <SchemaEgsSection />

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
