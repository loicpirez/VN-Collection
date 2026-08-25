import { SkeletonBlock, SkeletonBoundary } from './Skeleton';

function ProducerRoleSkeleton({ prefix }: { prefix: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-4 w-16" />
      </div>
      <ul
        className="grid gap-2"
        data-producer-role-skeleton={prefix}
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <li key={`${prefix}-${index}`} className="relative flex gap-2 rounded-lg border border-border bg-bg-elev/40 p-2 pr-10">
            <SkeletonBlock
              className="shrink-0 rounded"
              style={{
                width: 'clamp(72px, calc(var(--card-density-px, 220px) * 0.42), 200px)',
                aspectRatio: '2 / 3',
              }}
            />
            <div className="min-w-0 flex-1 space-y-2 py-1">
              <SkeletonBlock className="h-3 w-4/5" />
              <SkeletonBlock className="h-2.5 w-3/5" />
              <SkeletonBlock className="h-2.5 w-2/5" />
            </div>
            <SkeletonBlock className="absolute right-2 top-2 h-7 w-7" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Render the two density-aware producer credit groups while their VN payload resolves. */
export function ProducerVnsSkeleton({ label }: { label: string }) {
  return (
    <SkeletonBoundary label={label} className="mb-8 space-y-6">
      <SkeletonBlock className="h-6 w-64 max-w-full" />
      <ProducerRoleSkeleton prefix="developer" />
      <ProducerRoleSkeleton prefix="publisher" />
    </SkeletonBoundary>
  );
}
