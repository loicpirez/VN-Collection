import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';

export default function CharacterLoading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-6 w-32" />
      <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
        <SkeletonBlock className="aspect-[3/4] w-full rounded-2xl" />
        <div className="space-y-3">
          <SkeletonBlock className="h-8 w-3/4" />
          <SkeletonBlock className="h-4 w-1/2" />
          <SkeletonBlock className="h-20 w-full" />
        </div>
      </div>
      <SkeletonBlock className="h-6 w-40" />
      <SkeletonRows count={4} />
    </div>
  );
}
