import type { Metadata } from 'next';
import { getCacheFreshness } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { TagsBrowser } from '@/components/TagsBrowser';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.tags };
}

export default function TagsPage() {
  // Cache keys are stored as `{METHOD} {path}|{METHOD}|{hash}` (e.g.
  // `POST /tag|POST|<sha>`), and the per-tag drill-down rows live under
  // `tag_full:gXXX`. Anchor both prefixes so the freshness chip reflects
  // either kind of populated cache.
  const lastUpdatedAt = getCacheFreshness(['% /tag|%', 'tag_full:%']);
  return <TagsBrowser lastUpdatedAt={lastUpdatedAt} />;
}
