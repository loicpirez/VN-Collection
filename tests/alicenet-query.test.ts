import { describe, expect, it } from 'vitest';
import {
  isAliceNetGroup,
  isAliceNetSort,
  isAliceNetView,
  parseAliceNetQueryState,
} from '@/components/alicenet-types';

describe('AliceNet query state', () => {
  it('parses every supported URL field', () => {
    const state = parseAliceNetQueryState(new URLSearchParams(
      'filter=wishlist&sort=price_asc&group=producer&view=list&filters=0&producer=Alice&yearMin=2000&yearMax=2020&priceMin=100&priceMax=9000&q=title&page=3',
    ));
    expect(state).toEqual({
      filter: 'wishlist',
      sort: 'price_asc',
      group: 'producer',
      view: 'list',
      showFilters: true,
      producer: 'Alice',
      yearMin: '2000',
      yearMax: '2020',
      priceMin: '100',
      priceMax: '9000',
      search: 'title',
      page: 3,
    });
  });

  it('falls back safely for invalid enums, visibility, and pages', () => {
    expect(parseAliceNetQueryState(new URLSearchParams(
      'filter=bad&sort=bad&group=bad&view=bad&filters=bad&page=-2.5',
    ))).toEqual({
      filter: 'all',
      sort: null,
      group: null,
      view: null,
      showFilters: null,
      producer: '',
      yearMin: '',
      yearMax: '',
      priceMin: '',
      priceMax: '',
      search: '',
      page: 1,
    });
  });

  it('honors explicit filter visibility when no advanced filter is active', () => {
    expect(parseAliceNetQueryState(new URLSearchParams('filters=1')).showFilters).toBe(true);
    expect(parseAliceNetQueryState(new URLSearchParams('filters=0')).showFilters).toBe(false);
    expect(parseAliceNetQueryState(new URLSearchParams()).page).toBe(1);
  });

  it('exposes reusable preference guards', () => {
    expect(isAliceNetSort('updated_desc')).toBe(true);
    expect(isAliceNetSort(null)).toBe(false);
    expect(isAliceNetGroup('year')).toBe(true);
    expect(isAliceNetGroup('bad')).toBe(false);
    expect(isAliceNetView('cards')).toBe(true);
    expect(isAliceNetView(null)).toBe(false);
  });
});
