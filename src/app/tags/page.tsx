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
  const lastUpdatedAt = getCacheFreshness(['/tag|%', 'tag_full:%']);
  return <TagsBrowser lastUpdatedAt={lastUpdatedAt} />;
}
