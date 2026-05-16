import { SkeletonCardGrid } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 h-32 animate-pulse rounded-2xl border border-border bg-bg-card" />
      <SkeletonCardGrid count={12} />
    </div>
  );
}
