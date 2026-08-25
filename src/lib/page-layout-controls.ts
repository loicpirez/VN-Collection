import type { PageSpaceScope } from './page-space';
import type { DensityScope } from './settings/client';

/** Density surfaces configured inside each per-page spacing row. */
export const PAGE_LAYOUT_DENSITY_SCOPES: Partial<Record<PageSpaceScope, readonly DensityScope[]>> = {
  library: ['library'],
  wishlist: ['wishlist'],
  search: ['search'],
  vn: ['vnMedia'],
  staff: ['staffWorks'],
  character: ['characterWorks'],
  producer: ['producerWorks'],
  series: ['seriesWorks'],
  lists: ['lists'],
  shelf: ['shelf'],
  recommendations: ['recommendations'],
  topRanked: ['topRanked'],
  upcoming: ['upcoming'],
  similar: ['vnSimilar'],
  tags: ['tagPage'],
  dumped: ['dumped'],
  egs: ['egs'],
};

/** Fixed card-density choices used by per-page layout settings. */
export const CARD_DENSITY_PRESETS = [
  { id: 'compact', value: 160 },
  { id: 'balanced', value: 220 },
  { id: 'comfortable', value: 320 },
] as const;
