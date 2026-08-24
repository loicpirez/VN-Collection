'use client';
import { useEffect, useState } from 'react';
import {
  VN_COLLECTION_CHANGED_EVENT,
  type VnCollectionChangedDetail,
} from './vn-collection-events';

/** Track one VN's membership from server props plus local mutation events. */
export function useVnCollectionState(vnId: string, initialInCollection: boolean): boolean {
  const [inCollection, setInCollection] = useState(initialInCollection);

  useEffect(() => {
    setInCollection(initialInCollection);
    function onChanged(e: Event) {
      const detail = (e as CustomEvent<VnCollectionChangedDetail>).detail;
      if (!detail || detail.vnId !== vnId) return;
      setInCollection(detail.inCollection);
    }
    window.addEventListener(VN_COLLECTION_CHANGED_EVENT, onChanged as EventListener);
    return () => window.removeEventListener(VN_COLLECTION_CHANGED_EVENT, onChanged as EventListener);
  }, [vnId, initialInCollection]);

  return inCollection;
}
