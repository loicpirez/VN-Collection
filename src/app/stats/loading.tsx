import { SkeletonBlock } from '@/components/Skeleton';

export default function StatsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SkeletonBlock className="h-7 w-40" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <SkeletonBlock className="h-72 w-full rounded-2xl" />
      <SkeletonBlock className="h-72 w-full rounded-2xl" />
    </div>
  );
}
