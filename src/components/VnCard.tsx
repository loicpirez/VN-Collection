'use client';
import Link from 'next/link';
import { Star, CheckCheck, Clock, Hourglass, Building2 } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { SafeImage } from './SafeImage';
import { useT } from '@/lib/i18n/client';
import type { Status } from '@/lib/types';

export interface CardData {
  id: string;
  title: string;
  poster: string | null;
  localPoster?: string | null;
  customCover?: string | null;
  sexual?: number | null;
  released: string | null;
  rating: number | null;
  user_rating?: number | null;
  playtime_minutes?: number | null;
  length_minutes?: number | null;
  status?: Status;
  favorite?: boolean;
  inCollectionBadge?: boolean;
  developers?: { id?: string; name: string }[];
}

function fmtMinutes(m: number | null | undefined): string | null {
  if (m == null || m <= 0) return null;
  const h = Math.floor(m / 60);
  const mn = m % 60;
  if (h && mn) return `${h}h ${mn}m`;
  if (h) return `${h}h`;
  return `${mn}m`;
}

export function VnCard({ data }: { data: CardData }) {
  const t = useT();
  const ratingNum = data.user_rating ?? data.rating;
  const rating = ratingNum != null ? (ratingNum / 10).toFixed(1) : null;
  const year = data.released?.slice(0, 4);
  const myPlaytime = fmtMinutes(data.playtime_minutes);
  const vndbLength = fmtMinutes(data.length_minutes);

  const localSrc = data.customCover || data.localPoster || null;

  return (
    <Link
      href={`/vn/${data.id}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-bg-card transition-all hover:-translate-y-1 hover:border-accent hover:shadow-card"
    >
      {data.favorite && (
        <Star
          aria-label="favorite"
          className="absolute left-2 top-2 z-10 h-5 w-5 fill-accent text-accent drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]"
        />
      )}
      {data.status && (
        <div className="absolute right-2 top-2 z-10">
          <StatusBadge status={data.status} />
        </div>
      )}
      {data.inCollectionBadge && (
        <span className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-status-completed px-2 py-0.5 text-[11px] font-bold text-bg">
          <CheckCheck className="h-3 w-3" aria-hidden />
          {t.search.inCollection}
        </span>
      )}
      <SafeImage
        src={data.poster}
        localSrc={localSrc}
        alt={data.title}
        sexual={data.sexual ?? null}
        className="aspect-[2/3] w-full"
      />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-2 text-sm font-semibold leading-tight">{data.title}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          {rating && (
            <span className="inline-flex items-center gap-0.5 text-accent" title={data.user_rating != null ? t.detail.myRatingLabel : t.detail.lengthVndb}>
              <Star className="h-3 w-3 fill-accent" aria-hidden /> {rating}
            </span>
          )}
          {year && <span>{year}</span>}
        </div>
        {(myPlaytime || vndbLength) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
            {myPlaytime && (
              <span
                className="inline-flex items-center gap-1 font-semibold text-status-playing"
                title={t.detail.myPlaytime}
              >
                <Clock className="h-3 w-3" aria-hidden />
                {myPlaytime}
              </span>
            )}
            {vndbLength && (
              <span
                className={`inline-flex items-center gap-1 ${myPlaytime ? 'text-muted/70' : 'text-muted'}`}
                title={t.detail.lengthVndb}
              >
                <Hourglass className="h-3 w-3" aria-hidden />
                {vndbLength}
              </span>
            )}
          </div>
        )}
        {data.developers && data.developers.length > 0 && (
          <div
            className="inline-flex items-center gap-1 text-[11px] text-muted"
            title={data.developers.map((d) => d.name).join(', ')}
          >
            <Building2 className="h-3 w-3 shrink-0" aria-hidden />
            <span className="line-clamp-1">{data.developers.map((d) => d.name).join(', ')}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
