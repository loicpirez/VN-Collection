import Link from 'next/link';
import { Box, Layers, MapPin } from 'lucide-react';
import {
  listShelves,
  listShelfDisplaySlots,
  listShelfSlots,
  type ShelfDisplaySlotEntry,
  type ShelfSlotEntry,
  type ShelfUnitWithCount,
} from '@/lib/db';
import { SafeImage } from '@/components/SafeImage';
import { ShelfSpatialFullscreen } from '@/components/ShelfSpatialFullscreen';
import { getDict } from '@/lib/i18n/server';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/**
 * Read-only spatial visualization of every shelf.
 *
 * Renders each `shelf_unit` as a visual grid (cols × rows) with the
 * editor's same Top Display / Bottom Display / Between Rows
 * structure, but without ANY mutation control — no drag, no resize,
 * no rename, no add, no delete. Empty cells are dimmed but not
 * dashed-bordered so the page reads as a poster instead of an editor.
 *
 * Each placed card shows its cover, title (line-clamp), edition label
 * if any, and a small box-type chip. Clicking a card navigates to
 * `/vn/[id]`. The whole shelf can be opened in a fullscreen viewer
 * via the `<ShelfSpatialFullscreen>` client wrapper at the top of
 * the section.
 *
 * Used as the DEFAULT view at `/shelf` so the read-only "browse my
 * physical collection" use-case is the first thing the user sees.
 * The editor lives at `/shelf?view=layout`.
 */
export async function ShelfSpatialView() {
  const t = await getDict();
  const shelves = listShelves();
  if (shelves.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-bg-card p-6 text-center">
        <p className="text-sm text-muted">{t.shelfSpatial.empty}</p>
        <p className="mt-2 text-[11px] text-muted">{t.shelfSpatial.emptyHint}</p>
        <Link
          href="/shelf?view=layout"
          className="mt-3 inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/20"
        >
          {t.shelfSpatial.openEditor}
        </Link>
      </section>
    );
  }

  return (
    <ShelfSpatialFullscreen labels={t.shelfSpatial}>
      <div className="space-y-6">
        {shelves.map((shelf) => (
          <ShelfBlock key={shelf.id} shelf={shelf} t={t} />
        ))}
      </div>
    </ShelfSpatialFullscreen>
  );
}

function ShelfBlock({ shelf, t }: { shelf: ShelfUnitWithCount; t: Dictionary }) {
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
      className="rounded-2xl border border-border bg-bg-card p-3 sm:p-5"
      aria-labelledby={`shelf-${shelf.id}-name`}
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 id={`shelf-${shelf.id}-name`} className="text-base font-bold">
            {shelf.name || t.shelfSpatial.untitled}
          </h2>
          <p className="text-[11px] text-muted">
            {shelf.cols} × {shelf.rows} ·{' '}
            {t.shelfSpatial.filledCount
              .replace('{filled}', String(filledCells))
              .replace('{total}', String(totalCells))}
            {hasDisplayRows && (
              <>
                {' · '}
                <Layers className="mx-0.5 inline h-3 w-3 text-accent-blue" aria-hidden />
                {t.shelfSpatial.displayCount.replace('{n}', String(filledDisplays))}
              </>
            )}
          </p>
        </div>
      </header>

      <div className="space-y-1.5 overflow-x-auto">
        {/* Top display row (after_row = 0) */}
        <DisplayRow
          row={displayByAfterRow.get(0) ?? []}
          cols={shelf.cols}
          label={t.shelfSpatial.topDisplay}
          t={t}
        />
        {Array.from({ length: shelf.rows }).map((_, row) => (
          <div key={row}>
            <ShelfRow row={row} cols={shelf.cols} cellMap={cellMap} t={t} />
            {/* Display row that sits between this row and the next.
                after_row = row + 1; the last one (= shelf.rows) is
                the bottom display and renders separately below. */}
            {row < shelf.rows - 1 && (
              <DisplayRow
                row={displayByAfterRow.get(row + 1) ?? []}
                cols={shelf.cols}
                label={t.shelfSpatial.betweenRow
                  .replace('{above}', String(row + 1))
                  .replace('{below}', String(row + 2))}
                t={t}
                between
              />
            )}
          </div>
        ))}
        {/* Bottom display row (after_row = shelf.rows) */}
        <DisplayRow
          row={displayByAfterRow.get(shelf.rows) ?? []}
          cols={shelf.cols}
          label={t.shelfSpatial.bottomDisplay}
          t={t}
        />
      </div>
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
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(64px, 1fr))` }}
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
            className="aspect-[2/3] rounded-md bg-bg-elev/15"
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
}: {
  row: ShelfDisplaySlotEntry[];
  cols: number;
  label: string;
  t: Dictionary;
  between?: boolean;
}) {
  if (row.length === 0) return null;
  return (
    <div className="my-1">
      <p className="mb-1 inline-flex items-center gap-1 rounded bg-accent-blue/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-blue">
        <Layers className="h-2.5 w-2.5" aria-hidden />
        {label}
      </p>
      <div
        className={`grid gap-1.5 ${between ? 'border-t border-accent-blue/20 pt-1' : ''}`}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(64px, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, position) => {
          const display = row.find((d) => d.position === position);
          return display ? (
            <DisplayCard key={position} entry={display} t={t} />
          ) : (
            <div
              key={position}
              className="aspect-[3/2] rounded-md bg-accent-blue/5"
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
      className="group block aspect-[2/3] overflow-hidden rounded-md border border-border bg-bg-elev/40 transition-all hover:scale-[1.03] hover:border-accent hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      title={`${slot.vn_title}${slot.edition_label ? ` · ${slot.edition_label}` : ''}`}
      aria-label={slot.vn_title}
    >
      <div className="relative h-full w-full">
        <SafeImage
          src={slot.vn_image_url || slot.vn_image_thumb}
          localSrc={slot.vn_local_image_thumb}
          sexual={slot.vn_image_sexual}
          alt={slot.vn_title}
          className="h-full w-full object-cover"
        />
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

function DisplayCard({ entry, t }: { entry: ShelfDisplaySlotEntry; t: Dictionary }) {
  return (
    <Link
      href={`/vn/${entry.vn_id}`}
      // Face-out: a different visual cue from the back-row cards.
      // Wider aspect (3/2) + brighter border so the face-out row
      // visually breaks the back-row column rhythm.
      className="group block aspect-[3/2] overflow-hidden rounded-md border border-accent-blue/50 bg-accent-blue/5 transition-all hover:scale-[1.03] hover:border-accent-blue hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue"
      title={`${entry.vn_title}${entry.edition_label ? ` · ${entry.edition_label}` : ''}`}
      aria-label={`${t.shelfSpatial.displayItemPrefix} ${entry.vn_title}`}
    >
      <div className="relative h-full w-full">
        <SafeImage
          src={entry.vn_image_url || entry.vn_image_thumb}
          localSrc={entry.vn_local_image_thumb}
          sexual={entry.vn_image_sexual}
          alt={entry.vn_title}
          className="h-full w-full object-cover"
        />
      </div>
    </Link>
  );
}

// Used by the section header on `/shelf` to expose a quick visit-the-
// VN cover legend. Kept tree-shake-friendly behind a Suspense in the
// parent page; the helper here is just the type-level icon.
export const ShelfSpatialPinIcon = MapPin;
