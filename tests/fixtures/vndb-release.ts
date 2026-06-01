import type { VndbRelease, VndbReleaseLanguage, VndbReleaseVn } from '@/lib/vndb-types';

export interface VndbReleaseFixtureInput {
  id: string;
  title?: string;
  alttitle?: string | null;
  languages?: Array<Pick<VndbReleaseLanguage, 'lang'> & Partial<Omit<VndbReleaseLanguage, 'lang'>>>;
  platforms?: string[];
  released?: string | null;
  resolution?: VndbRelease['resolution'];
  vns: Array<Pick<VndbReleaseVn, 'id'> & Partial<Omit<VndbReleaseVn, 'id'>>>;
}

/** Build a complete synthetic VNDB release row for materialization tests. */
export function vndbReleaseFixture(input: VndbReleaseFixtureInput): VndbRelease {
  return {
    id: input.id,
    title: input.title ?? input.id,
    alttitle: input.alttitle ?? null,
    languages: (input.languages ?? []).map((language) => ({
      title: null,
      latin: null,
      mtl: false,
      main: false,
      ...language,
    })),
    platforms: input.platforms ?? [],
    media: [],
    released: input.released ?? null,
    minage: null,
    patch: false,
    freeware: false,
    uncensored: null,
    official: true,
    has_ero: false,
    resolution: input.resolution ?? null,
    engine: null,
    voiced: null,
    notes: null,
    gtin: null,
    catalog: null,
    producers: [],
    extlinks: [],
    vns: input.vns.map((vn) => ({ rtype: 'complete', ...vn })),
    images: [],
  };
}
