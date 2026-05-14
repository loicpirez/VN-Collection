import { getCacheFreshness } from '@/lib/db';
import { TagsBrowser } from '@/components/TagsBrowser';

export const dynamic = 'force-dynamic';

export default function TagsPage() {
  const lastUpdatedAt = getCacheFreshness(['/tag|%', 'tag_full:%']);
  return <TagsBrowser lastUpdatedAt={lastUpdatedAt} />;
}
