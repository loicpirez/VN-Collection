/**
 * Loading skeleton primitives. Use these instead of spinners — they mirror the
 * shape of the eventual content so the UI doesn't jump when data arrives.
 *
 * Rule of thumb (also in CLAUDE.md): every async section renders a skeleton
 * while the request is in flight. "No results" / "empty" copy is **only** for
 * post-resolve zero-item cases. Never show emptiness during loading.
 *
 * For screen readers, wrap any skeleton tree in `<SkeletonBoundary>` (or
 * apply `aria-busy="true"` + `aria-live="polite"` on the surrounding
 * container). The boundary exposes a polite live region with a
 * configurable label so SR users hear "Loading…" instead of silence.
 */

interface BlockProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind size classes (h-* w-* etc.) — anything goes. */
  className?: string;
}

/**
 * Wrap any skeleton tree to announce loading to screen-reader users.
 * Renders a `<div aria-busy aria-live="polite">` with an optional
 * visually-hidden label so SR users hear "Loading…" while the
 * placeholder paints. Sighted users see only the children.
 *
 *   <SkeletonBoundary label={t.common.loading}>
 *     <SkeletonCardGrid count={12} />
 *   </SkeletonBoundary>
 */
export function SkeletonBoundary({
  children,
  label,
  className,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div
      aria-busy
      aria-live="polite"
      role="status"
      className={className}
    >
      {label && <span className="sr-only">{label}</span>}
      {children}
    </div>
  );
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
 *
 * Mirrors the density-driven grid used by real cards so the layout doesn't
 * jump between skeleton and real content. Falls back to 220px column min when
 * the consumer is not wrapped in a CardDensityVarSetter.
 *
 * Sets `aria-busy="true"` + `aria-live="polite"` so screen readers
 * announce the loading state without the caller needing to wrap.
 */
export function SkeletonCardGrid({
  count = 18,
  label,
}: {
  count?: number;
  /** Optional visually-hidden label announced to screen readers. */
  label?: string;
}) {
  return (
    <div
      aria-busy
      aria-live="polite"
      role="status"
      className="grid gap-5"
      style={{
        gridTemplateColumns:
          'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))',
      }}
    >
      {label && <span className="sr-only">{label}</span>}
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/**
 * Stack of horizontal rows — good for a list of releases, characters, credits,
 * activity entries, etc. Each row has a thumbnail block + two text lines.
 *
 * Sets `aria-busy="true"` + `aria-live="polite"` so screen readers
 * announce the loading state without the caller needing to wrap.
 */
export function SkeletonRows({
  count = 5,
  withThumb = true,
  label,
}: {
  count?: number;
  withThumb?: boolean;
  /** Optional visually-hidden label announced to screen readers. */
  label?: string;
}) {
  return (
    <ul
      aria-busy
      aria-live="polite"
      role="status"
      className="space-y-3"
    >
      {label && <li className="sr-only">{label}</li>}
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

/**
 * A horizontal row of tab-shaped placeholders — for a tab bar / segmented
 * control while its labels resolve. Each tab is a wide rounded bar; combine
 * with the content skeleton below it.
 */
export function SkeletonTabRow({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cx('flex flex-wrap gap-2', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className="h-8 w-24 rounded-full" />
      ))}
    </div>
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

/**
 * Tabular skeleton — header row + N body rows. Sets `aria-busy` so screen
 * readers announce the loading state without the caller needing to wrap.
 */
export function SkeletonTable({
  rows = 6,
  cols = 4,
  label,
}: {
  rows?: number;
  cols?: number;
  /** Optional visually-hidden label announced to screen readers. */
  label?: string;
}) {
  return (
    <div
      aria-busy
      aria-live="polite"
      role="status"
      className="overflow-hidden rounded-xl border border-border bg-bg-card"
    >
      {label && <span className="sr-only">{label}</span>}
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
