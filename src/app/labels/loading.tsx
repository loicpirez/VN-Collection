import { SkeletonBlock } from '@/components/Skeleton';

export default function LabelsLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SkeletonBlock className="h-7 w-48" />
      <SkeletonBlock className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
