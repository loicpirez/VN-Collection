'use client';
import { VnCard } from './VnCard';
import { useT } from '@/lib/i18n/client';
import type { CollectionItem, Status } from '@/lib/types';

interface Props {
  items: CollectionItem[];
  emptyMessage?: string;
}

export function VnGrid({ items, emptyMessage }: Props) {
  const t = useT();
  if (items.length === 0) {
    return <div className="py-12 text-center text-muted">{emptyMessage ?? t.library.empty.descriptionFiltered}</div>;
  }
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((it) => (
        <VnCard
          key={it.id}
          data={{
            id: it.id,
            title: it.title,
            poster: it.image_thumb || it.image_url,
            localPoster: it.local_image_thumb || it.local_image,
            customCover: it.custom_cover,
            sexual: it.image_sexual,
            released: it.released,
            rating: it.rating,
            user_rating: it.user_rating,
            playtime_minutes: it.playtime_minutes,
            length_minutes: it.length_minutes,
            status: it.status as Status | undefined,
            favorite: it.favorite,
            developers: it.developers,
          }}
        />
      ))}
    </div>
  );
}
