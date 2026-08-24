import { describe, expect, it } from 'vitest';
import {
  createNumberedPageMeta,
  createOffsetPageMeta,
  createOffsetPageWindow,
  decodeNumberedPageMeta,
  decodeOffsetPageMeta,
  decodeOffsetPageWindow,
} from '@/lib/server-pagination';

describe('shared server pagination contract', () => {
  it('builds offset windows and continuation state', () => {
    expect(createOffsetPageWindow(10, 4, 4)).toEqual({ total: 10, limit: 4, offset: 4 });
    expect(createOffsetPageMeta(10, 4, 4, 4)).toEqual({
      total: 10,
      limit: 4,
      offset: 4,
      has_more: true,
    });
    expect(createOffsetPageMeta(10, 4, 8, 2).has_more).toBe(false);
  });

  it('builds numbered pages with one-based visible ranges', () => {
    expect(createNumberedPageMeta({
      page: 2,
      pageSize: 4,
      total: 10,
      totalPages: 3,
      startIndex: 4,
      itemCount: 4,
    })).toEqual({ page: 2, page_size: 4, total: 10, total_pages: 3, start: 5, end: 8 });
    expect(createNumberedPageMeta({
      page: 1,
      pageSize: 4,
      total: 0,
      totalPages: 1,
      startIndex: 0,
      itemCount: 0,
    }).start).toBe(0);
  });

  it('decodes only bounded offset windows', () => {
    expect(decodeOffsetPageWindow({ total: 10, limit: 4, offset: 2 }, 4)).toEqual({ total: 10, limit: 4, offset: 2 });
    expect(decodeOffsetPageWindow(null)).toBeNull();
    expect(decodeOffsetPageWindow({ total: -1, limit: 4, offset: 0 })).toBeNull();
    expect(decodeOffsetPageWindow({ total: 1, limit: 0, offset: 0 })).toBeNull();
    expect(decodeOffsetPageWindow({ total: 1, limit: 5, offset: 0 }, 4)).toBeNull();
    expect(decodeOffsetPageWindow({ total: 1, limit: 1, offset: -1 })).toBeNull();
  });

  it('requires a boolean continuation indicator for offset metadata', () => {
    expect(decodeOffsetPageMeta({ total: 10, limit: 4, offset: 2, has_more: true }, 4)).toEqual({
      total: 10,
      limit: 4,
      offset: 2,
      has_more: true,
    });
    expect(decodeOffsetPageMeta({ total: 10, limit: 4, offset: 2 })).toBeNull();
    expect(decodeOffsetPageMeta('invalid')).toBeNull();
  });

  it('decodes coherent numbered page ranges', () => {
    const valid = { page: 1, page_size: 20, total: 30, total_pages: 2, start: 1, end: 20 };
    expect(decodeNumberedPageMeta(valid, 20)).toEqual(valid);
    expect(decodeNumberedPageMeta(null)).toBeNull();
    expect(decodeNumberedPageMeta({ ...valid, page: 0 })).toBeNull();
    expect(decodeNumberedPageMeta({ ...valid, page_size: 0 })).toBeNull();
    expect(decodeNumberedPageMeta({ ...valid, page_size: 21 }, 20)).toBeNull();
    expect(decodeNumberedPageMeta({ ...valid, total: -1 })).toBeNull();
    expect(decodeNumberedPageMeta({ ...valid, total_pages: 0 })).toBeNull();
    expect(decodeNumberedPageMeta({ ...valid, start: -1 })).toBeNull();
    expect(decodeNumberedPageMeta({ ...valid, start: 31 })).toBeNull();
    expect(decodeNumberedPageMeta({ ...valid, end: -1 })).toBeNull();
    expect(decodeNumberedPageMeta({ ...valid, end: 31 })).toBeNull();
    expect(decodeNumberedPageMeta({ ...valid, start: 10, end: 9 })).toBeNull();
  });
});
