import { SkeletonCardGrid } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-4">
      <div className="h-7 w-48 animate-pulse rounded bg-bg-elev/60" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-bg-elev/40" />
      <SkeletonCardGrid />
    </div>
  );
}
