import { SkeletonRows } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="w-full">
      <div className="mb-6 h-24 animate-pulse rounded-2xl bg-bg-card" />
      <SkeletonRows count={6} />
    </div>
  );
}
