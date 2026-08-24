import { describe, expect, it } from 'vitest';
import {
  EGS_QUICK_SEARCH_PAGE_SIZE,
  VNDB_ADVANCED_SEARCH_PAGE_MAX,
  VNDB_ADVANCED_SEARCH_PAGE_SIZE,
  VNDB_ADVANCED_SEARCH_PAGE_SIZE_MAX,
  VNDB_QUICK_SEARCH_PAGE_SIZE,
} from '@/lib/search-result-limits';

describe('search result window limits', () => {
  it('keeps every provider request bounded and the client window below the server cap', () => {
    expect(VNDB_QUICK_SEARCH_PAGE_SIZE).toBe(30);
    expect(EGS_QUICK_SEARCH_PAGE_SIZE).toBe(40);
    expect(VNDB_ADVANCED_SEARCH_PAGE_SIZE).toBe(50);
    expect(VNDB_ADVANCED_SEARCH_PAGE_SIZE_MAX).toBe(100);
    expect(VNDB_ADVANCED_SEARCH_PAGE_MAX).toBe(100);
    expect(VNDB_ADVANCED_SEARCH_PAGE_SIZE).toBeLessThanOrEqual(VNDB_ADVANCED_SEARCH_PAGE_SIZE_MAX);
  });
});
