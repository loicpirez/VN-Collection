import { SkeletonCardGrid } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div>
      <div className="mb-6 h-10 w-48 animate-pulse rounded-md bg-bg-elev/60" />
      <SkeletonCardGrid count={18} />
    </div>
  );
}
