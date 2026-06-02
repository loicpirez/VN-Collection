'use client';
import { Children, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { fmtNum } from '@/lib/locale-number';

interface Props {
  children: ReactNode;
  ariaLabel: string;
  resetKey: string;
  className?: string;
  style?: CSSProperties;
  pageSize?: number;
}

/**
 * Render a bounded page of list items while keeping every row reachable.
 *
 * @param props Grid children, layout styling, localized navigation label, and reset identity.
 * @returns A paginated list with touch-safe navigation when more than one page exists.
 */
export function PaginatedGrid({
  children,
  ariaLabel,
  resetKey,
  className = 'grid gap-3',
  style,
  pageSize = 60,
}: Props) {
  const t = useT();
  const locale = useLocale();
  const items = useMemo(() => Children.toArray(children), [children]);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleItems = items.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <>
      <ul className={className} style={style}>
        {visibleItems}
      </ul>
      {totalPages > 1 && (
        <nav className="mt-4 flex flex-wrap items-center justify-between gap-2" aria-label={ariaLabel}>
          <button
            type="button"
            className="btn min-h-[44px]"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t.common.prev}
          </button>
          <span className="text-xs text-muted">
            {fmtNum(pageStart + 1, locale)}-{fmtNum(Math.min(items.length, pageStart + pageSize), locale)}
            {' / '}
            {fmtNum(items.length, locale)}
          </span>
          <button
            type="button"
            className="btn min-h-[44px]"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            {t.common.next}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </nav>
      )}
    </>
  );
}
