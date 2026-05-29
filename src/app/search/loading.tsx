import { SkeletonCardGrid, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

/**
 * Next.js auto-renders this file during navigation to /search and while the
 * route segment is suspending. Without it, the previous page (often
 * /vn/[id], which leaks "Personal notes" copy) stays visible until the
 * search page hydrates.
 */
export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading}>
      <div className="mb-3 h-10 w-full animate-pulse rounded-md bg-bg-elev/60" />
      <SkeletonCardGrid count={18} />
    </SkeletonBoundary>
  );
}
