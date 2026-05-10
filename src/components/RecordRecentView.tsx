'use client';
import { useEffect } from 'react';
import { recordRecentlyViewed } from '@/lib/recentlyViewed';

interface Props {
  id: string;
  title: string;
  poster: string | null;
  localPoster: string | null;
  sexual: number | null;
}

/**
 * Side-effect-only component: records the VN in localStorage as
 * "recently viewed" the first time the detail page mounts.
 */
export function RecordRecentView({ id, title, poster, localPoster, sexual }: Props) {
  useEffect(() => {
    recordRecentlyViewed({ id, title, poster, localPoster, sexual });
  }, [id, title, poster, localPoster, sexual]);
  return null;
}
