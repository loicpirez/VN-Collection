import { SkeletonCardGrid } from '@/components/Skeleton';

/**
 * Next.js auto-renders this file during navigation to /search and while the
 * route segment is suspending. Without it, the previous page (often
 * /vn/[id], which leaks "Personal notes" copy) stays visible until the
 * search page hydrates.
 */
export default function Loading() {
  return (
    <div>
      <div className="mb-3 h-10 w-full animate-pulse rounded-md bg-bg-elev/60" />
      <SkeletonCardGrid count={18} />
    </div>
  );
}
