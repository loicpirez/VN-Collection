import type { Metadata } from 'next';
import { getCacheFreshness } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { TagsBrowser } from '@/components/TagsBrowser';
import { parseTagsPageParams } from '@/lib/tags-page-modes';

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
  return <TagsBrowser lastUpdatedAt={lastUpdatedAt} initialMode={mode} />;
}
