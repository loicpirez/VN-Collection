/** Stable browser event used to synchronize VN collection membership islands. */
export const VN_COLLECTION_CHANGED_EVENT = 'vn:collection-changed';

export interface VnCollectionChangedDetail {
  /** VN whose local collection membership changed. */
  vnId: string;
  /** Authoritative membership state after the completed mutation. */
  inCollection: boolean;
}

const pendingMembership = new Map<string, boolean>();

/** Read a completed mutation that the destination's server props have not acknowledged yet. */
export function getPendingVnCollectionState(vnId: string): boolean | undefined {
  return pendingMembership.get(vnId);
}

/** Clear only the mutation reflected in authoritative server props, retaining a newer conflicting write. */
export function acknowledgeVnCollectionState(vnId: string, inCollection: boolean): void {
  if (pendingMembership.get(vnId) === inCollection) pendingMembership.delete(vnId);
}

/** Publish a successful local collection membership mutation. SSR-safe. */
export function dispatchVnCollectionChanged(detail: VnCollectionChangedDetail): void {
  if (typeof window === 'undefined') return;
  pendingMembership.set(detail.vnId, detail.inCollection);
  window.dispatchEvent(new CustomEvent<VnCollectionChangedDetail>(VN_COLLECTION_CHANGED_EVENT, { detail }));
}
