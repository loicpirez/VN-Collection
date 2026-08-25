import { SearchPageSkeleton } from '@/components/SearchPageSkeleton';
import { getDict } from '@/lib/i18n/server';

/**
 * Next.js auto-renders this file during navigation to /search and while the
 * route segment is suspending. Without it, the previous page (often
 * /vn/[id], which leaks "Personal notes" copy) stays visible until the
 * search page hydrates.
 */
export default async function Loading() {
  const t = await getDict();
  return <SearchPageSkeleton label={t.common.loading} />;
}
