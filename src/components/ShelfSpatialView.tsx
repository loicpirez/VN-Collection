import React, { type ReactNode } from 'react';
import Link from 'next/link';
import { Box, ChevronLeft, ChevronRight, Layers, MapPin } from 'lucide-react';
import {
  listShelves,
  listShelfDisplaySlots,
  listShelfSlots,
  type ShelfDisplaySlotEntry,
  type ShelfSlotEntry,
  type ShelfUnitWithCount,
} from '@/lib/db';
import { SafeImage } from '@/components/SafeImage';
import { ShelfScrollFrame } from '@/components/ShelfScrollFrame';
import { ShelfSpatialFullscreen } from '@/components/ShelfSpatialFullscreen';
import { getDict } from '@/lib/i18n/server';
import type { Dictionary } from '@/lib/i18n/dictionaries';

const SHELF_TRACK_WIDTH = 'max(var(--shelf-cell-w-px, 120px), var(--shelf-front-size-px, 140px))';

/**
 * Read-only spatial visualization of ONE shelf at a time.
 *
 * Renders the active `shelf_unit` (selected via `?shelf=<index>` on
 * `/shelf`, 1-indexed) as a visual grid (cols x rows) with the
 * editor's same Top Display / Bottom Display / Between Rows
 * structure, but without ANY mutation control - no drag, no resize,
 * no rename, no add, no delete. Empty cells are dimmed but not
 * dashed-bordered so the page reads as a poster instead of an editor.
 *
 * The view used to stack every shelf vertically on a single long
 * page. The user wants a "vitrine" experience - one shelf, then
 * Previous/Next to switch. The carousel-style controls live above
 * the rendered shelf and surface "X / Y" so the user knows where
 * they are.
 *
 * Each placed card shows its cover, title (line-clamp), edition
 * label if any, and a small box-type chip. Clicking a card
 * navigates to `/vn/[id]`. The active shelf can be opened in a
 * fullscreen viewer via the `<ShelfSpatialFullscreen>` client
 * wrapper at the top of the section, which also wires
 * ArrowLeft/Right keys to move between shelves (URL-driven via
 * pushState so the Next/Prev links and the keys stay in sync).
 *
 * Used as the DEFAULT view at `/shelf` so the read-only "browse my
 * physical collection" use-case is the first thing the user sees.
 * The editor lives at `/shelf?view=layout`.
 */
export async function ShelfSpatialView({
  activeShelf,
  defaultOrientation = 'portrait',
  displayRowOrientations = {},
  controlsSlot,
}: {
  /** 1-indexed; clamped at the page boundary. Defaults to 1. */
  activeShelf?: number;
  /** Default face-out orientation for rows that have no per-row override. */
  defaultOrientation?: 'portrait' | 'landscape';
  /**
   * Per-display-zone orientation overrides keyed by `afterRow` string
   * (e.g. `'0'` = top display, `'1'` = between rows 1-2, etc.).
   * Populated from `?dr0=landscape&dr1=portrait` URL params.
   */
  displayRowOrientations?: Record<string, 'portrait' | 'landscape'>;
  /**
   * Shelf display-options control to surface inside the fullscreen
   * overlay. Passed straight through to ShelfSpatialFullscreen so the
   * user can adjust sizing/fit/orientation without exiting fullscreen.
   */
  controlsSlot?: ReactNode;
}) {
  const t = await getDict();
  const shelves = listShelves();
  if (shelves.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-bg-card p-6 text-center">
        <p className="text-sm text-muted">{t.shelfSpatial.empty}</p>
        <p className="mt-2 text-[11px] text-muted">{t.shelfSpatial.emptyHint}</p>
        <Link
          href="/shelf?view=layout"
          className="mt-3 inline-flex min-h-[44px] items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/20 sm:min-h-0"
        >
          {t.shelfSpatial.openEditor}
        </Link>
      </section>
    );
  }
  const total = shelves.length;
  const active = Math.max(1, Math.min(total, Math.floor(activeShelf ?? 1)));
  const current = shelves[active - 1];
  const prevHref = active > 1 ? `/shelf?shelf=${active - 1}` : null;
  const nextHref = active < total ? `/shelf?shelf=${active + 1}` : null;

  return (
    <ShelfSpatialFullscreen
      labels={t.shelfSpatial}
      prevHref={prevHref}
      nextHref={nextHref}
      controlsSlot={controlsSlot}
    >
      <nav
        className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-bg-card/60 px-3 py-2 text-xs"
        aria-label={t.shelfSpatial.carouselLabel}
      >
        <span className="text-muted tabular-nums">
          {t.shelfSpatial.shelfIndex
            .replace('{current}', String(active))
            .replace('{total}', String(total))}
        </span>
        <div className="inline-flex items-center gap-2">
          {prevHref ? (
            <Link
              href={prevHref}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-muted hover:border-accent hover:text-accent sm:min-h-0"
              aria-label={t.shelfSpatial.prevShelf}
            >
              <ChevronLeft className="h-3 w-3" aria-hidden /> {t.shelfSpatial.prevShelf}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-muted opacity-40">
              <ChevronLeft className="h-3 w-3" aria-hidden /> {t.shelfSpatial.prevShelf}
            </span>
          )}
          {nextHref ? (
            <Link
              href={nextHref}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-accent hover:bg-accent/20 sm:min-h-0"
              aria-label={t.shelfSpatial.nextShelf}
            >
              {t.shelfSpatial.nextShelf} <ChevronRight className="h-3 w-3" aria-hidden />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-muted opacity-40">
              {t.shelfSpatial.nextShelf} <ChevronRight className="h-3 w-3" aria-hidden />
            </span>
          )}
        </div>
      </nav>
      <ShelfBlock
        shelf={current}
        t={t}
        defaultOrientation={defaultOrientation}
        displayRowOrientations={displayRowOrientations}
      />
    </ShelfSpatialFullscreen>
  );
}

function ShelfBlock({
  shelf,
  t,
  defaultOrientation,
  displayRowOrientations,
}: {
  shelf: ShelfUnitWithCount;
  t: Dictionary;
  defaultOrientation: 'portrait' | 'landscape';
  displayRowOrientations: Record<string, 'portrait' | 'landscape'>;
}) {
  const slots = listShelfSlots(shelf.id);
  const displays = listShelfDisplaySlots(shelf.id);

  // Map placements to (row, col) and (after_row, position) for O(1)
  // lookup while rendering the grid.
  const cellMap = new Map<string, ShelfSlotEntry>();
  for (const s of slots) cellMap.set(`${s.row}|${s.col}`, s);
  const displayByAfterRow = new Map<number, ShelfDisplaySlotEntry[]>();
  for (const d of displays) {
    const cur = displayByAfterRow.get(d.after_row);
    if (cur) cur.push(d);
    else displayByAfterRow.set(d.after_row, [d]);
  }

  const hasDisplayRows = displays.length > 0;
  const totalCells = shelf.cols * shelf.rows;
  const filledCells = slots.length;
  const filledDisplays = displays.length;

  return (
    <section
      className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6"
      aria-labelledby={`shelf-${shelf.id}-name`}
    >
      <style>{`
        .shelf-view-root[data-shelf-labels="off"] .shelf-card-label { display: none; }
        .shelf-view-root .shelf-card-label { font-size: var(--shelf-label-font-px, 10px); }
      `}</style>
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-3">
        <div className="min-w-0 flex-1">
          <h2 id={`shelf-${shelf.id}-name`} className="text-lg font-bold">
            {shelf.name || t.shelfSpatial.untitled}
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            {shelf.cols} x {shelf.rows} /{' '}
            {t.shelfSpatial.filledCount
              .replace('{filled}', String(filledCells))
              .replace('{total}', String(totalCells))}
            {hasDisplayRows && (
              <>
                {' / '}
                <Layers className="mx-0.5 inline h-3 w-3 text-accent-blue" aria-hidden />
                {t.shelfSpatial.displayCount.replace('{n}', String(filledDisplays))}
              </>
            )}
          </p>
        </div>
      </header>

      {/*
        Flat grid: every shelf row and every display row (top / between /
        bottom) is a direct grid child so `--shelf-section-gap-px` controls
        the spacing between ALL rows.  `--shelf-row-gap-px` continues to
        control the spacing between CELLS within a single shelf row.
      */}
      <ShelfScrollFrame>
        <div style={{ display: 'grid', gap: 'var(--shelf-section-gap-px, 16px)', width: 'max-content' }}>
        {((): React.ReactNode => {
          const rowOrientation = (afterRow: number) =>
            displayRowOrientations[String(afterRow)] ?? defaultOrientation;
          return (
            <>
              <DisplayRow
                row={displayByAfterRow.get(0) ?? []}
                cols={shelf.cols}
                label={t.shelfSpatial.topDisplay}
                t={t}
                orientation={rowOrientation(0)}
                afterRow={0}
              />
              {Array.from({ length: shelf.rows }).flatMap((_, row) => {
                const items: React.ReactNode[] = [
                  <ShelfRow key={`row-${row}`} row={row} cols={shelf.cols} cellMap={cellMap} t={t} />,
                ];
                if (row < shelf.rows - 1) {
                  const afterRow = row + 1;
                  items.push(
                    <DisplayRow
                      key={`disp-${row}`}
                      row={displayByAfterRow.get(afterRow) ?? []}
                      cols={shelf.cols}
                      label={t.shelfSpatial.betweenRow
                        .replace('{above}', String(row + 1))
                        .replace('{below}', String(row + 2))}
                      t={t}
                      between
                      orientation={rowOrientation(afterRow)}
                      afterRow={afterRow}
                    />,
                  );
                }
                return items;
              })}
              <DisplayRow
                row={displayByAfterRow.get(shelf.rows) ?? []}
                cols={shelf.cols}
                label={t.shelfSpatial.bottomDisplay}
                t={t}
                orientation={rowOrientation(shelf.rows)}
                afterRow={shelf.rows}
              />
            </>
          );
        })()}
        </div>
      </ShelfScrollFrame>
    </section>
  );
}

function ShelfRow({
  row,
  cols,
  cellMap,
  t,
}: {
  row: number;
  cols: number;
  cellMap: Map<string, ShelfSlotEntry>;
  t: Dictionary;
}) {
  return (
    <div
      data-shelf-row-grid
      className="grid w-max"
      style={{
        gap: 'var(--shelf-row-gap-px, 6px)',
        gridTemplateColumns: `repeat(${cols}, minmax(${SHELF_TRACK_WIDTH}, ${SHELF_TRACK_WIDTH}))`,
        justifyItems: 'center',
      }}
      role="row"
      aria-label={t.shelfSpatial.rowLabel.replace('{n}', String(row + 1))}
    >
      {Array.from({ length: cols }).map((_, col) => {
        const slot = cellMap.get(`${row}|${col}`);
        return slot ? (
          <ShelfCard key={`${row}|${col}`} slot={slot} t={t} />
        ) : (
          <div
            key={`${row}|${col}`}
            className="rounded-md bg-bg-elev/15"
            style={{
              width: 'var(--shelf-cell-w-px, 120px)',
              height: 'var(--shelf-cell-h-px, 180px)',
            }}
            aria-hidden
          />
        );
      })}
    </div>
  );
}

function DisplayRow({
  row,
  cols,
  label,
  t,
  between = false,
  orientation,
  afterRow,
}: {
  row: ShelfDisplaySlotEntry[];
  cols: number;
  label: string;
  t: Dictionary;
  between?: boolean;
  orientation: 'portrait' | 'landscape';
  afterRow: number;
}) {
  if (row.length === 0) return null;
  const serverAspect = orientation === 'landscape' ? '3/2' : '2/3';
  return (
    <div className="my-1 w-max">
      <div className="mb-1">
        <span className="inline-flex items-center gap-1 rounded bg-accent-blue/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-blue">
          <Layers className="h-2.5 w-2.5" aria-hidden />
          {label}
        </span>
      </div>
      <div
        data-shelf-display-grid
        className={`grid w-max ${between ? 'border-t border-accent-blue/20 pt-1' : ''}`}
        style={{
          gap: 'var(--shelf-row-gap-px, 6px)',
          gridTemplateColumns: `repeat(${cols}, minmax(${SHELF_TRACK_WIDTH}, ${SHELF_TRACK_WIDTH}))`,
          justifyItems: 'center',
          '--row-display-aspect': `var(--display-aspect-row-${afterRow}, var(--display-aspect-ratio, ${serverAspect}))`,
        } as React.CSSProperties}
      >
        {Array.from({ length: cols }).map((_, position) => {
          const display = row.find((d) => d.position === position);
          return display ? (
            <DisplayCard key={position} entry={display} t={t} />
          ) : (
            <div
              key={position}
              className="rounded-md bg-accent-blue/5"
              style={{ width: 'var(--shelf-front-size-px, 140px)', aspectRatio: 'var(--row-display-aspect, 2/3)' }}
              aria-hidden
            />
          );
        })}
      </div>
    </div>
  );
}

function ShelfCard({ slot, t }: { slot: ShelfSlotEntry; t: Dictionary }) {
  return (
    <Link
      href={`/vn/${slot.vn_id}`}
      className="group block overflow-hidden rounded-md border border-border bg-bg-elev/40 transition-all hover:scale-[1.03] hover:border-accent hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      style={{
        width: 'var(--shelf-cell-w-px, 120px)',
        height: 'var(--shelf-cell-h-px, 180px)',
        padding: 'var(--shelf-card-pad, 0px)',
      }}
      title={`${slot.vn_title}${slot.edition_label ? ` / ${slot.edition_label}` : ''}`}
      aria-label={slot.vn_title}
    >
      <div className="relative h-full w-full">
        <SafeImage
          src={slot.vn_image_url || slot.vn_image_thumb}
          localSrc={slot.vn_local_image_thumb}
          sexual={slot.vn_image_sexual}
          alt={slot.vn_title}
          className="h-full w-full"
          style={{
            objectFit: 'var(--shelf-fit-mode, cover)' as never,
            transform: 'scale(var(--shelf-cover-scale, 1))',
          }}
        />
        <span className="shelf-card-label pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-bg/80 px-1 py-0.5 text-[10px] font-medium text-white">
          {slot.vn_title}
        </span>
        {slot.dumped && (
          <span
            className="absolute right-0.5 top-0.5 rounded bg-status-completed/80 px-1 text-[9px] font-bold text-bg"
            title={t.shelf.dumped}
          >
            <Box className="h-2 w-2" aria-hidden />
          </span>
        )}
      </div>
    </Link>
  );
}

function DisplayCard({
  entry,
  t,
}: {
  entry: ShelfDisplaySlotEntry;
  t: Dictionary;
}) {
  return (
    <Link
      href={`/vn/${entry.vn_id}`}
      className="group block overflow-hidden rounded-md border border-accent-blue/50 bg-accent-blue/5 transition-all hover:scale-[1.03] hover:border-accent-blue hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue"
      style={{
        width: 'var(--shelf-front-size-px, 140px)',
        aspectRatio: 'var(--row-display-aspect, 2/3)',
      }}
      title={`${entry.vn_title}${entry.edition_label ? ` / ${entry.edition_label}` : ''}`}
      aria-label={`${t.shelfSpatial.displayItemPrefix} ${entry.vn_title}`}
    >
      <div className="relative h-full w-full">
        <SafeImage
          src={entry.vn_image_url || entry.vn_image_thumb}
          localSrc={entry.vn_local_image_thumb}
          sexual={entry.vn_image_sexual}
          alt={entry.vn_title}
          className="h-full w-full"
          style={{
            objectFit: 'var(--shelf-fit-mode, cover)' as never,
            transform: 'scale(var(--shelf-cover-scale, 1))',
          }}
        />
        <span className="shelf-card-label pointer-events-none absolute inset-x-0 bottom-0 line-clamp-1 bg-bg/80 px-1 py-0.5 text-[10px] font-medium text-white">
          {entry.vn_title}
        </span>
      </div>
    </Link>
  );
}

// Used by the section header on `/shelf` to expose a quick visit-the-
// VN cover legend. Kept tree-shake-friendly behind a Suspense in the
// parent page; the helper here is just the type-level icon.
export const ShelfSpatialPinIcon = MapPin;
