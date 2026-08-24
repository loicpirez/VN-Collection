/** Shared metadata for a bounded offset-based server window. */
export interface OffsetPageWindow {
  total: number;
  limit: number;
  offset: number;
}

/** Offset window with a derived continuation indicator. */
export interface OffsetPageMeta extends OffsetPageWindow {
  has_more: boolean;
}

/** Shared metadata for a one-based numbered server page. */
export interface NumberedPageMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  start: number;
  end: number;
}

/** Build a serializable offset window without repeating field ordering. */
export function createOffsetPageWindow(
  total: number,
  limit: number,
  offset: number,
): OffsetPageWindow {
  return { total, limit, offset };
}

/** Build an offset window and derive whether another server request is useful. */
export function createOffsetPageMeta(
  total: number,
  limit: number,
  offset: number,
  itemCount: number,
): OffsetPageMeta {
  return { ...createOffsetPageWindow(total, limit, offset), has_more: offset + itemCount < total };
}

/** Build one-based page metadata from a zero-based item start. */
export function createNumberedPageMeta({
  page,
  pageSize,
  total,
  totalPages,
  startIndex,
  itemCount,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  startIndex: number;
  itemCount: number;
}): NumberedPageMeta {
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: totalPages,
    start: total === 0 ? 0 : startIndex + 1,
    end: startIndex + itemCount,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function integerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

/** Decode a bounded offset window from an untrusted local API payload. */
export function decodeOffsetPageWindow(
  value: unknown,
  maximumLimit = Number.MAX_SAFE_INTEGER,
): OffsetPageWindow | null {
  const record = asRecord(value);
  if (
    !record ||
    !integerAtLeast(record.total, 0) ||
    !integerAtLeast(record.limit, 1) ||
    record.limit > maximumLimit ||
    !integerAtLeast(record.offset, 0)
  ) return null;
  return createOffsetPageWindow(record.total, record.limit, record.offset);
}

/** Decode an offset window that also carries a continuation indicator. */
export function decodeOffsetPageMeta(
  value: unknown,
  maximumLimit = Number.MAX_SAFE_INTEGER,
): OffsetPageMeta | null {
  const window = decodeOffsetPageWindow(value, maximumLimit);
  const record = asRecord(value);
  return window && record && typeof record.has_more === 'boolean'
    ? { ...window, has_more: record.has_more }
    : null;
}

/** Decode a one-based numbered page from an untrusted local API payload. */
export function decodeNumberedPageMeta(
  value: unknown,
  maximumPageSize = Number.MAX_SAFE_INTEGER,
): NumberedPageMeta | null {
  const record = asRecord(value);
  if (
    !record ||
    !integerAtLeast(record.page, 1) ||
    !integerAtLeast(record.page_size, 1) ||
    record.page_size > maximumPageSize ||
    !integerAtLeast(record.total, 0) ||
    !integerAtLeast(record.total_pages, 1) ||
    !integerAtLeast(record.start, 0) ||
    record.start > record.total ||
    !integerAtLeast(record.end, 0) ||
    record.end > record.total ||
    record.end < record.start
  ) return null;
  return {
    page: record.page,
    page_size: record.page_size,
    total: record.total,
    total_pages: record.total_pages,
    start: record.start,
    end: record.end,
  };
}
