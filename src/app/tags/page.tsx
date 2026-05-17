import type { Metadata } from 'next';
import { getCacheFreshness } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { TagsBrowser } from '@/components/TagsBrowser';
import { parseTagsPageParams } from '@/lib/tags-page-modes';
import { getVndbTagHomeTree } from '@/lib/vndb-tag-web-cache';
import type { VndbTagHomeTree } from '@/lib/vndb-tag-web-parser';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.tags };
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TagsPage({ searchParams }: PageProps) {
  // Cache keys are stored as `{METHOD} {path}|{METHOD}|{hash}` (e.g.
  // `POST /tag|POST|<sha>`), and the per-tag drill-down rows live under
  // `tag_full:gXXX`. Anchor both prefixes so the freshness chip reflects
  // either kind of populated cache.
  const lastUpdatedAt = getCacheFreshness(['% /tag|%', 'tag_full:%']);
  const sp = await searchParams;
  const { mode } = parseTagsPageParams(sp);

  // Pre-fetch the scraped tag hierarchy on the server so the VNDB mode
  // can render without an extra client-side round-trip. Wrapped in
  // try/catch so a scraping failure does not crash the page — the
  // client will fall back to fetching via /api/tags/web-tree instead.
  let initialTree: VndbTagHomeTree | null = null;
  try {
    const result = await getVndbTagHomeTree();
    initialTree = result.data ?? null;
  } catch {
    // Scraping unavailable — client-side fetch will handle it.
    initialTree = null;
  }

  return <TagsBrowser lastUpdatedAt={lastUpdatedAt} initialMode={mode} initialTree={initialTree} />;
}
