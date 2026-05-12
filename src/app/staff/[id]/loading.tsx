import { SkeletonCardGrid } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 h-32 animate-pulse rounded-2xl bg-bg-card" />
      <SkeletonCardGrid count={9} />
    </div>
  );
}
