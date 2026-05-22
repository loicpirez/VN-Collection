import { SkeletonBlock } from '@/components/Skeleton';

export default function DataLoading() {
  return (
    <div className="w-full space-y-6">
      <SkeletonBlock className="h-9 w-48" />
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </div>
  );
}
