import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

function HeroSkeletonBlock(props: React.ComponentProps<typeof SkeletonBlock>) {
  return <SkeletonBlock {...props} animated={false} />;
}

export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="w-full space-y-4">
      <SkeletonBlock className="vn-mobile-library-return h-11 w-24 md:hidden" />
      <div
        className="vn-hero-skeleton-context relative isolate rounded-2xl border border-border bg-bg-card shadow-card"
        data-vn-hero-skeleton
      >
        <div className="relative z-0 h-64 overflow-hidden rounded-t-2xl" data-vn-banner-skeleton-shell>
          <HeroSkeletonBlock className="h-full w-full rounded-none" />
        </div>

        <div className="relative -mt-44 grid grid-cols-1 gap-4 px-3 pb-4 sm:gap-6 sm:px-6 sm:pb-6 md:grid-cols-[260px_1fr] md:gap-8 md:px-8 md:pb-8">
          <div
            data-vn-cover-skeleton-shell
            className="relative z-10 mx-auto aspect-[2/3] w-full max-w-[260px] overflow-hidden rounded-xl border border-border bg-bg-card shadow-card md:mx-0"
          >
            <HeroSkeletonBlock className="h-full w-full rounded-xl" />
          </div>
          <div className="min-w-0 space-y-4 pt-6 md:pt-44">
            <div className="space-y-2">
              <HeroSkeletonBlock className="h-8 w-3/4 max-w-xl" />
              <HeroSkeletonBlock className="h-3 w-2/5 max-w-sm" />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
              <HeroSkeletonBlock className="h-14 w-full" />
              <HeroSkeletonBlock className="h-14 w-full" />
              <HeroSkeletonBlock className="h-14 w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="space-y-1.5">
                  <HeroSkeletonBlock className="h-2.5 w-16" />
                  <HeroSkeletonBlock className="h-4 w-24 max-w-full" />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <HeroSkeletonBlock className="h-9 w-28" />
              <HeroSkeletonBlock className="h-9 w-32" />
              <HeroSkeletonBlock className="h-9 w-24" />
            </div>
          </div>
        </div>

        <div className="border-t border-border px-3 py-4 sm:px-6 sm:py-6 md:px-8">
          <HeroSkeletonBlock className="mb-3 h-3 w-24" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <HeroSkeletonBlock key={index} className={`h-3 ${index === 4 ? 'w-2/3' : 'w-full'}`} />
            ))}
          </div>
        </div>

        <div className="border-t border-border px-3 py-4 sm:px-6 sm:py-6 md:px-8">
          <HeroSkeletonBlock className="mb-3 h-3 w-20" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <HeroSkeletonBlock key={index} className="aspect-[2/3] w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonBoundary>
  );
}
