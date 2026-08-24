/** Stable browser event used to synchronize VN collection membership islands. */
export const VN_COLLECTION_CHANGED_EVENT = 'vn:collection-changed';

export interface VnCollectionChangedDetail {
  /** VN whose local collection membership changed. */
  vnId: string;
  /** Authoritative membership state after the completed mutation. */
  inCollection: boolean;
}

/** Publish a successful local collection membership mutation. SSR-safe. */
export function dispatchVnCollectionChanged(detail: VnCollectionChangedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<VnCollectionChangedDetail>(VN_COLLECTION_CHANGED_EVENT, { detail }));
}
