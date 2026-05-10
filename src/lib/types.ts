export const STATUSES = ['planning', 'playing', 'completed', 'on_hold', 'dropped'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_ICONS: Record<Status, string> = {
  planning: '◷',
  playing: '▶',
  completed: '✓',
  on_hold: '⏸',
  dropped: '✕',
};

export const EDITION_TYPES = ['none', 'physical', 'digital', 'limited', 'standard', 'collector', 'download_code'] as const;
export type EditionType = (typeof EDITION_TYPES)[number];

export const LOCATIONS = ['unknown', 'fr', 'jp', 'en', 'de', 'cn', 'kr', 'tw', 'us', 'other'] as const;
export type Location = (typeof LOCATIONS)[number];

export interface Screenshot {
  id?: string;
  url: string;
  thumbnail: string;
  sexual?: number;
  violence?: number;
  dims?: [number, number];
  local?: string | null;
  local_thumb?: string | null;
}

export type ReleaseImageType = 'pkgfront' | 'pkgback' | 'pkgcontent' | 'pkgside' | 'pkgmed' | 'dig';

export interface ReleaseImage {
  id?: string;
  release_id: string;
  release_title: string;
  type: ReleaseImageType;
  url: string;
  thumbnail?: string | null;
  dims?: [number, number] | null;
  sexual?: number;
  violence?: number;
  languages?: string[] | null;
  photo?: boolean;
  local?: string | null;
  local_thumb?: string | null;
}

export interface VnRow {
  id: string;
  title: string;
  alttitle: string | null;
  image_url: string | null;
  image_thumb: string | null;
  image_sexual: number | null;
  image_violence: number | null;
  released: string | null;
  olang: string | null;
  languages: string[];
  platforms: string[];
  length_minutes: number | null;
  length: number | null;
  rating: number | null;
  votecount: number | null;
  description: string | null;
  developers: { id: string; name: string }[];
  tags: { id: string; name: string; rating: number; spoiler: number }[];
  screenshots: Screenshot[];
  release_images: ReleaseImage[];
  local_image: string | null;
  local_image_thumb: string | null;
  custom_cover: string | null;
  banner_image: string | null;
  fetched_at: number;
}

export interface CollectionFields {
  status: Status;
  user_rating: number | null;
  playtime_minutes: number;
  started_date: string | null;
  finished_date: string | null;
  notes: string | null;
  favorite: boolean;
  location: Location;
  edition_type: EditionType;
  edition_label: string | null;
  physical_location: string | null;
  added_at: number;
  updated_at: number;
}

export type CollectionItem = VnRow & Partial<CollectionFields> & { series?: SeriesLite[] };

export interface VndbSearchHit {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  rating: number | null;
  votecount: number | null;
  length_minutes: number | null;
  languages: string[];
  platforms: string[];
  image: { url: string; thumbnail: string } | null;
  developers: { name: string }[];
  in_collection: boolean;
}

export interface Stats {
  total: number;
  byStatus: { status: Status; n: number }[];
  playtime_minutes: number;
}

export interface ProducerRow {
  id: string;
  name: string;
  original: string | null;
  lang: string | null;
  type: string | null;
  description: string | null;
  aliases: string[];
  extlinks: { url: string; label: string; name: string }[];
  logo_path: string | null;
  fetched_at: number;
}

export interface ProducerStat extends ProducerRow {
  vn_count: number;
  avg_user_rating: number | null;
  avg_rating: number | null;
}

export interface SeriesRow {
  id: number;
  name: string;
  description: string | null;
  cover_path: string | null;
  created_at: number;
  updated_at: number;
}

export interface SeriesLite {
  id: number;
  name: string;
}

export interface SeriesWithVns extends SeriesRow {
  vns: { id: string; title: string; image_thumb: string | null; local_image_thumb: string | null; status: Status | null; order_index: number }[];
}
