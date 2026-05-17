import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Tag as TagIcon } from 'lucide-react';
import { db } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { tagPageEmptyState } from '@/lib/tag-page-empty-state';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

/**
 * `/tag/[id]` — minimal tag landing page. Surfaces a count of the
 * VNs in the operator's local Library that carry this tag, plus a
 * "Browse in Library" deep link. When the Library has zero matches
 * the page falls back to a "Explorer sur VNDB" CTA per Blocker 10's
 * spec so the user has somewhere to pivot to instead of a dead end.
 *
 * Kept intentionally lightweight — the heavy lifting (tag detail
 * page with co-occurring, filters, etc.) is the Library view. This
 * page exists to give the chip a target without requiring the user
 * to type the URL.
 */
export default async function TagPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^g\d+$/i.test(id)) notFound();
  const t = await getDict();
  const tagId = id.toLowerCase();

  // Count how many local-collection VNs carry this tag. Same JSON
  // walk pattern as `listCollectionTags` in lib/db.ts.
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM collection c JOIN vn v ON v.id = c.vn_id, json_each(v.tags) je
       WHERE json_extract(je.value, '$.id') = ?`,
    )
    .get(tagId) as { n: number };
  const count = row?.n ?? 0;
  const state = tagPageEmptyState({ tagId, collectionCount: count });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/tags" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.tags}
      </Link>

      <header className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <TagIcon className="h-6 w-6 text-accent" aria-hidden /> {tagId}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {state.isEmpty ? t.tagPage.emptyHint : t.tagPage.countHint.replace('{n}', String(count))}
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {state.isEmpty ? (
            <a
              href={state.vndbExternal}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {t.tagPage.exploreOnVndb}
            </a>
          ) : (
            <Link href={state.fallbackLibrary} className="btn btn-primary">
              {t.tagPage.openLibrary}
            </Link>
          )}
          {!state.isEmpty && (
            <a
              href={state.vndbExternal}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> VNDB
            </a>
          )}
        </div>
      </header>
    </div>
  );
}
