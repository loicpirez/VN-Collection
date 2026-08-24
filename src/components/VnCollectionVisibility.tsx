'use client';
import type { ReactNode } from 'react';
import { useVnCollectionState } from '@/lib/use-vn-collection-state';

interface Props {
  /** VN identity used to scope membership events. */
  vnId: string;
  /** Membership value rendered by the server. */
  initialInCollection: boolean;
  /** Membership state in which the children are visible. */
  when: boolean;
  /** Collection-dependent action surface. */
  children: ReactNode;
}

/** Mount or unmount a client island immediately when VN membership changes. */
export function VnCollectionVisibility({ vnId, initialInCollection, when, children }: Props) {
  const inCollection = useVnCollectionState(vnId, initialInCollection);
  return inCollection === when ? children : null;
}
