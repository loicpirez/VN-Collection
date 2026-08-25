import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { WishlistWorkspaceSkeleton } from '@/components/WishlistWorkspaceSkeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full" densityScope="wishlist">
      <header className="mb-6 flex items-center gap-3" data-wishlist-header-skeleton>
        <SkeletonBlock className="h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-7 w-48 max-w-full" />
          <SkeletonBlock className="h-3 w-80 max-w-full" />
        </div>
      </header>
      <WishlistWorkspaceSkeleton />
    </SkeletonBoundary>
  );
}
