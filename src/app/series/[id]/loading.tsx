import { SkeletonCardGrid } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-9 w-72 animate-pulse rounded bg-bg-elev/60" />
      <div className="h-4 w-1/3 animate-pulse rounded bg-bg-elev/40" />
      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <div className="aspect-[2/3] animate-pulse rounded-xl bg-bg-elev/40" />
        <div className="space-y-3">
          <div className="h-6 w-3/4 animate-pulse rounded bg-bg-elev/60" />
          <div className="h-4 w-full animate-pulse rounded bg-bg-elev/30" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-bg-elev/30" />
        </div>
      </div>
      <SkeletonCardGrid />
    </div>
  );
}
