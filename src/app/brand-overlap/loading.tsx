import { SkeletonRows } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="w-full">
      <div className="mb-6 h-32 animate-pulse rounded-2xl bg-bg-card" />
      <SkeletonRows count={6} />
    </div>
  );
}
