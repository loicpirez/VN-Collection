import { SkeletonBlock, SkeletonCardGrid } from '@/components/Skeleton';

export default function CharactersLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="w-full space-y-4">
      <SkeletonBlock className="h-4 w-24" />
      <SkeletonBlock className="h-32 w-full rounded-2xl" />
      <SkeletonCardGrid count={12} />
    </div>
  );
}
