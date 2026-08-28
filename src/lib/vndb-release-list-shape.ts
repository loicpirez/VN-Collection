/** VNDB release-list states accepted by PATCH /rlist. */
export const VNDB_RELEASE_LIST_STATUSES = [0, 1, 2, 3, 4] as const;

/** One VNDB release-list state. */
export type VndbReleaseListStatus = (typeof VNDB_RELEASE_LIST_STATUSES)[number];

/** Release-list data nested in one authenticated VN list entry. */
export interface VndbUlistRelease {
  id: string;
  title: string;
  list_status: VndbReleaseListStatus;
}

/** Return whether a value is a supported VNDB release-list state. */
export function isVndbReleaseListStatus(value: unknown): value is VndbReleaseListStatus {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}
