import { SkeletonBlock } from '@/components/Skeleton';

export default function CompareLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SkeletonBlock className="h-7 w-40" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="aspect-[2/3] w-full rounded-xl" />
        ))}
      </div>
      <SkeletonBlock className="h-64 w-full rounded-2xl" />
    </div>
  );
}
