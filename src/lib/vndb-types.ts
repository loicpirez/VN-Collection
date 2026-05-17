import type { Screenshot } from './types';

export interface VndbCharacter {
  id: string;
  name: string;
  original: string | null;
  aliases: string[];
  description: string | null;
  image: { url: string; dims?: [number, number]; sexual?: number; violence?: number } | null;
  blood_type: string | null;
  height: number | null;
  weight: number | null;
  bust: number | null;
  waist: number | null;
  hips: number | null;
  cup: string | null;
  age: number | null;
  birthday: [number, number] | null;
  sex: [string | null, string | null] | null;
  gender: [string | null, string | null] | null;
  vns: VndbCharacterVn[];
  traits: { id: string; name: string; group_name: string; spoiler: number; sexual: boolean }[];
  localImage?: string | null;
}

export interface VndbCharacterVn {
  id: string;
  role: 'main' | 'primary' | 'side' | 'appears';
  spoiler: number;
  title?: string;
  alttitle?: string | null;
  released?: string | null;
  image?: { url: string; thumbnail?: string; sexual?: number } | null;
  rating?: number | null;
}

export interface VndbStaff {
  id: string;
  aid: number;
  ismain: boolean;
  name: string;
  original: string | null;
  lang: string | null;
  gender: string | null;
  description: string | null;
  extlinks: { url: string; label: string; name: string }[];
}

export interface VndbTag {
  id: string;
  name: string;
  aliases: string[];
  description: string | null;
  category: 'cont' | 'ero' | 'tech';
  searchable: boolean;
  applicable: boolean;
  vn_count: number;
}

export interface VndbTrait {
  id: string;
  name: string;
  aliases: string[];
  description: string | null;
  searchable: boolean;
  applicable: boolean;
  sexual: boolean;
  group_id: string | null;
  group_name: string | null;
  char_count: number;
}

export interface VndbReleaseLanguage {
  lang: string;
  title: string | null;
  latin: string | null;
  mtl: boolean;
  main: boolean;
}

export interface VndbReleaseImage {
  id: string;
  url: string;
  thumbnail?: string;
  dims?: [number, number];
  sexual?: number;
  violence?: number;
  type: 'pkgfront' | 'pkgback' | 'pkgcontent' | 'pkgside' | 'pkgmed' | 'dig';
  languages?: string[] | null;
  photo?: boolean;
  vn?: string | null;
}

export interface VndbRelease {
  id: string;
  title: string;
  alttitle: string | null;
  languages: VndbReleaseLanguage[];
  platforms: string[];
  media: { medium: string; qty: number }[];
  released: string | null;
  minage: number | null;
  patch: boolean;
  freeware: boolean;
  uncensored: boolean | null;
  official: boolean;
  has_ero: boolean;
  resolution: [number, number] | string | null;
  engine: string | null;
  voiced: number | null;
  notes: string | null;
  gtin: string | null;
  catalog: string | null;
  producers: { id: string; name: string; developer: boolean; publisher: boolean }[];
  extlinks: { url: string; label: string; name: string; id?: string | number }[];
  vns: { id: string; rtype: 'trial' | 'partial' | 'complete' }[];
  images: VndbReleaseImage[];
}

export interface VndbQuote {
  id: string;
  quote: string;
  score: number;
  vn: { id: string; title: string } | null;
  /**
   * When the local API has mirrored the character portrait, the
   * quote shape is enriched with an `image.local_path`. The field
   * is optional so VNDB-shaped responses without a local mirror
   * still satisfy the type.
   */
  character:
    | {
        id: string;
        name: string;
        original: string | null;
        image?: { local_path?: string | null } | null;
      }
    | null;
}

export interface VndbStatsGlobal {
  chars: number;
  producers: number;
  releases: number;
  staff: number;
  tags: number;
  traits: number;
  vn: number;
}

export type { Screenshot };
