import { SkeletonCardGrid } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <div className="mb-6 h-32 animate-pulse rounded-2xl bg-bg-card" />
      <SkeletonCardGrid count={12} />
    </div>
  );
}
