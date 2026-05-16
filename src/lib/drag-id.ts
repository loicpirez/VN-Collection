/**
 * Drag-id parser for the shelf layout editor's `@dnd-kit` ids.
 *
 * The encoding is intentionally string-based so each draggable carries
 * its own type tag plus all the data we need without consulting any
 * external map. Pipe (`|`) is the delimiter — the original colon (`:`)
 * collided with synthetic release ids (`synthetic:v1234`) and produced
 * silent drag failures when the splitter mis-counted segments.
 *
 *   pool|<vnId>|<releaseId>
 *   slot|<vnId>|<releaseId>|<shelfId>|<row>|<col>
 *   display|<vnId>|<releaseId>|<shelfId>|<afterRow>|<position>
 *
 * Pulled out of `<ShelfLayoutEditor>` so the tests can exercise the
 * same code path the component runs at drag end — previously the test
 * suite re-inlined the parser and would silently pass while the source
 * regressed.
 */
export type DragSource =
  | { kind: 'pool'; vn_id: string; release_id: string }
  | {
      kind: 'slot';
      vn_id: string;
      release_id: string;
      shelf_id: number;
      row: number;
      col: number;
    }
  | {
      kind: 'display';
      vn_id: string;
      release_id: string;
      shelf_id: number;
      after_row: number;
      position: number;
    };

export function parseDragId(id: string): DragSource | null {
  if (id.startsWith('pool|')) {
    const [, vnId, releaseId] = id.split('|');
    if (!vnId || !releaseId) return null;
    return { kind: 'pool', vn_id: vnId, release_id: releaseId };
  }
  if (id.startsWith('slot|')) {
    const parts = id.split('|');
    if (parts.length !== 6) return null;
    const [, vnId, releaseId, shelfId, row, col] = parts;
    const sid = Number(shelfId);
    const r = Number(row);
    const c = Number(col);
    if (!vnId || !releaseId) return null;
    if (!Number.isInteger(sid) || !Number.isInteger(r) || !Number.isInteger(c)) return null;
    return {
      kind: 'slot',
      vn_id: vnId,
      release_id: releaseId,
      shelf_id: sid,
      row: r,
      col: c,
    };
  }
  if (id.startsWith('display|')) {
    const parts = id.split('|');
    if (parts.length !== 6) return null;
    const [, vnId, releaseId, shelfId, afterRow, position] = parts;
    const sid = Number(shelfId);
    const r = Number(afterRow);
    const p = Number(position);
    if (!vnId || !releaseId) return null;
    if (!Number.isInteger(sid) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
    return {
      kind: 'display',
      vn_id: vnId,
      release_id: releaseId,
      shelf_id: sid,
      after_row: r,
      position: p,
    };
  }
  return null;
}

/** Cell-id is the drop-target shape: `cell|<shelfId>|<row>|<col>`. */
export interface CellTarget {
  shelf_id: number;
  row: number;
  col: number;
}

export function parseCellId(id: string): CellTarget | null {
  if (!id.startsWith('cell|')) return null;
  const parts = id.split('|');
  if (parts.length !== 4) return null;
  const sid = Number(parts[1]);
  const r = Number(parts[2]);
  const c = Number(parts[3]);
  if (!Number.isInteger(sid) || !Number.isInteger(r) || !Number.isInteger(c)) return null;
  return { shelf_id: sid, row: r, col: c };
}

/** Front-display drop-target shape:
 *  `display-cell|<shelfId>|<afterRow>|<position>`. */
export interface DisplayTarget {
  shelf_id: number;
  after_row: number;
  position: number;
}

export function parseDisplayCellId(id: string): DisplayTarget | null {
  if (!id.startsWith('display-cell|')) return null;
  const parts = id.split('|');
  if (parts.length !== 4) return null;
  const sid = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(sid) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  return { shelf_id: sid, after_row: r, position: p };
}
