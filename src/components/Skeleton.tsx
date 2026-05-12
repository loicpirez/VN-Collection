/**
 * Loading skeleton primitives. Use these instead of spinners — they mirror the
 * shape of the eventual content so the UI doesn't jump when data arrives.
 *
 * Rule of thumb (also in CLAUDE.md): every async section renders a skeleton
 * while the request is in flight. "No results" / "empty" copy is **only** for
 * post-resolve zero-item cases. Never show emptiness during loading.
 */

interface BlockProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind size classes (h-* w-* etc.) — anything goes. */
  className?: string;
}

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Single rectangle pulse. Use to mock a heading, a line of text, an avatar —
 * combine multiple to mock more complex layouts.
 */
export function SkeletonBlock({ className, ...rest }: BlockProps) {
  return (
    <div
      aria-hidden
      className={cx('animate-pulse rounded-md bg-bg-elev/60', className)}
      {...rest}
    />
  );
}

/**
 * A single card placeholder that matches the dimensions of <VnCard>. Stacked
 * cover area on top, then two short text lines for title / metadata.
 */
export function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-bg-card">
      <SkeletonBlock className="aspect-[2/3] w-full rounded-none" />
      <div className="space-y-2 p-3">
        <SkeletonBlock className="h-3 w-3/4" />
        <SkeletonBlock className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}

/**
 * Grid of card placeholders. Use for any cover-based list (library, wishlist,
 * search, recommendations, similar VN, …).
 */
export function SkeletonCardGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/**
 * Stack of horizontal rows — good for a list of releases, characters, credits,
 * activity entries, etc. Each row has a thumbnail block + two text lines.
 */
export function SkeletonRows({ count = 5, withThumb = true }: { count?: number; withThumb?: boolean }) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex gap-3 rounded-lg border border-border bg-bg-elev/30 p-3">
          {withThumb && <SkeletonBlock className="h-20 w-14 shrink-0" />}
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <SkeletonBlock className="h-3 w-2/3" />
            <SkeletonBlock className="h-2.5 w-1/3" />
            <SkeletonBlock className="h-2.5 w-1/4" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A few stacked text lines — for paragraph / detail-panel placeholders. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className={cx('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

/** Tabular skeleton — header row + N body rows. */
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-card">
      <div className="grid border-b border-border bg-bg-elev/30 p-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={i} className="mx-1 h-3 w-3/4" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid p-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }).map((_, c) => (
              <SkeletonBlock key={c} className="mx-1 h-3 w-2/3" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
