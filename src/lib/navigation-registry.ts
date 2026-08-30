export type NavigationGroupId = 'primary' | 'discover' | 'browse' | 'insights';

export type NavigationRouteId =
  | 'library'
  | 'wishlist'
  | 'search'
  | 'upcoming'
  | 'topRanked'
  | 'recommendations'
  | 'similar'
  | 'compare'
  | 'quotes'
  | 'lists'
  | 'producers'
  | 'series'
  | 'tags'
  | 'traits'
  | 'characters'
  | 'staff'
  | 'seiyuu'
  | 'brandOverlap'
  | 'stats'
  | 'shelf'
  | 'year'
  | 'labels'
  | 'dumped'
  | 'activity'
  | 'steam'
  | 'egs'
  | 'stock'
  | 'places'
  | 'map'
  | 'schema'
  | 'data';

export interface NavigationRoute {
  id: NavigationRouteId;
  group: NavigationGroupId;
  href: string;
  exact?: boolean;
}

const STATIC_HREFS: Record<Exclude<NavigationRouteId, 'year'>, string> = {
  library: '/',
  wishlist: '/wishlist',
  search: '/search',
  upcoming: '/upcoming',
  topRanked: '/top-ranked',
  recommendations: '/recommendations',
  similar: '/similar',
  compare: '/compare',
  quotes: '/quotes',
  lists: '/lists',
  producers: '/producers',
  series: '/series',
  tags: '/tags',
  traits: '/traits',
  characters: '/characters',
  staff: '/staff',
  seiyuu: '/seiyuu',
  brandOverlap: '/brand-overlap',
  stats: '/stats',
  shelf: '/shelf',
  labels: '/labels',
  dumped: '/dumped',
  activity: '/activity',
  steam: '/steam',
  egs: '/egs',
  stock: '/stock',
  places: '/places',
  map: '/map',
  schema: '/schema',
  data: '/data',
};

const NAVIGATION_DEFINITIONS: ReadonlyArray<Omit<NavigationRoute, 'href'>> = [
  { id: 'library', group: 'primary', exact: true },
  { id: 'wishlist', group: 'primary' },
  { id: 'search', group: 'primary' },
  { id: 'upcoming', group: 'discover' },
  { id: 'topRanked', group: 'discover' },
  { id: 'recommendations', group: 'discover' },
  { id: 'similar', group: 'discover' },
  { id: 'compare', group: 'discover' },
  { id: 'quotes', group: 'discover' },
  { id: 'lists', group: 'discover' },
  { id: 'producers', group: 'browse' },
  { id: 'series', group: 'browse' },
  { id: 'tags', group: 'browse' },
  { id: 'traits', group: 'browse' },
  { id: 'characters', group: 'browse' },
  { id: 'staff', group: 'browse' },
  { id: 'seiyuu', group: 'browse' },
  { id: 'brandOverlap', group: 'insights' },
  { id: 'stats', group: 'insights' },
  { id: 'shelf', group: 'insights' },
  { id: 'year', group: 'insights' },
  { id: 'labels', group: 'insights' },
  { id: 'dumped', group: 'insights' },
  { id: 'activity', group: 'insights' },
  { id: 'steam', group: 'insights' },
  { id: 'egs', group: 'insights' },
  { id: 'stock', group: 'insights' },
  { id: 'places', group: 'insights' },
  { id: 'map', group: 'insights' },
  { id: 'schema', group: 'insights' },
  { id: 'data', group: 'insights' },
];

/** Resolve the canonical application route for a navigation destination. */
export function navigationHref(id: NavigationRouteId, year: number): string {
  if (id === 'year') return `/year?y=${year}`;
  return STATIC_HREFS[id];
}

/** Build the grouped navigation registry for the active calendar year. */
export function buildNavigationRegistry(year: number): NavigationRoute[] {
  return NAVIGATION_DEFINITIONS.map((definition) => ({
    ...definition,
    href: navigationHref(definition.id, year),
  }));
}
