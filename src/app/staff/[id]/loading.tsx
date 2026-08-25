import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

function CreditCardSkeleton({
  visibilityClass,
}: {
  visibilityClass: string;
}) {
  return (
    <li className={`${visibilityClass} gap-3 rounded-lg border border-border bg-bg-elev/40 p-2`}>
      <SkeletonBlock
        className="shrink-0 rounded"
        style={{
          width: 'clamp(72px, calc(var(--card-density-px, 220px) * 0.42), 200px)',
          aspectRatio: '2 / 3',
        }}
      />
      <div className="min-w-0 flex-1 py-1">
        <SkeletonBlock className="h-4 w-4/5" />
        <SkeletonBlock className="mt-2 h-3 w-3/5" />
        <div className="mt-3 flex gap-2">
          <SkeletonBlock className="h-5 w-12" />
          <SkeletonBlock className="h-5 w-14" />
        </div>
        <div className="mt-3 flex items-start gap-2">
          <SkeletonBlock className="h-11 w-11 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <SkeletonBlock className="h-3 w-3/4" />
            <SkeletonBlock className="h-2.5 w-1/2" />
          </div>
        </div>
      </div>
    </li>
  );
}

function CreditSectionSkeleton() {
  return (
    <section
      className="rounded-xl border border-border bg-bg-card p-4 sm:p-6"
      data-staff-primary-credit-skeleton
    >
      <SkeletonBlock className="mb-4 h-4 w-44" />
      <ul
        className="grid gap-3"
        data-staff-credit-grid-skeleton
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 280px)), 1fr))',
        }}
      >
        {Array.from({ length: 12 }).map((_, index) => {
          const visibilityClass = index >= 8 ? 'hidden xl:flex' : index >= 4 ? 'hidden sm:flex' : 'flex';
          return (
            <CreditCardSkeleton
              key={index}
              visibilityClass={visibilityClass}
            />
          );
        })}
      </ul>
    </section>
  );
}

export default async function StaffDetailLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full" densityScope="staffWorks">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />

      <header
        className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6"
        data-staff-detail-skeleton
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-8 w-72 max-w-full" />
            <SkeletonBlock className="mt-2 h-4 w-40 max-w-[75%]" />
            <div className="mt-3 flex flex-wrap gap-2">
              <SkeletonBlock className="h-11 w-24 can-hover:sm:h-7" />
              <SkeletonBlock className="h-11 w-24 can-hover:sm:h-7" />
              <SkeletonBlock className="h-11 w-40 can-hover:sm:h-7" />
              <SkeletonBlock className="h-11 w-44 can-hover:sm:h-7" />
            </div>
            <div className="mt-3" data-staff-profile-common-skeleton>
              <SkeletonBlock className="h-2.5 w-16" />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <SkeletonBlock className="h-6 w-24" />
                <SkeletonBlock className="h-6 w-28" />
                <SkeletonBlock className="h-6 w-24" />
              </div>
              <SkeletonBlock className="mt-4 h-2.5 w-24" />
              <div className="mt-2 space-y-2">
                <SkeletonBlock className="h-3 w-full max-w-[42rem]" />
                <SkeletonBlock className="h-3 w-4/5 max-w-[36rem]" />
              </div>
              <SkeletonBlock className="mt-4 h-2.5 w-16" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <SkeletonBlock className="h-7 w-28" />
                <SkeletonBlock className="h-7 w-24" />
                <SkeletonBlock className="h-7 w-20" />
                <SkeletonBlock className="h-7 w-20" />
                <SkeletonBlock className="h-7 w-24" />
              </div>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 self-start sm:w-auto">
            <SkeletonBlock className="h-[54px] w-[400px] max-w-full" />
            <SkeletonBlock className="h-11 w-44" />
            <SkeletonBlock className="h-11 w-[104px]" />
          </div>
        </div>
        <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-bg-elev p-1">
          <SkeletonBlock className="h-9 w-24" />
          <SkeletonBlock className="h-9 w-36" />
        </div>
      </header>

      <CreditSectionSkeleton />
      <div className="mt-4 flex justify-end">
        <SkeletonBlock className="h-11 w-28 can-hover:sm:h-8" />
      </div>
    </SkeletonBoundary>
  );
}
