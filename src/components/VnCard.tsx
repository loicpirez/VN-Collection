'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Star, CheckCheck, Clock, Hourglass, Building2, Check, Loader2, Plus } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { SafeImage } from './SafeImage';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';
import { useResolvedTitle } from './TitleLine';
import type { Status } from '@/lib/types';

export interface CardData {
  id: string;
  title: string;
  alttitle?: string | null;
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

interface VnCardProps {
  data: CardData;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** When true and the VN isn't in collection, render a hover "+ Add" button. */
  enableAdd?: boolean;
  /** Called after a successful add. Receives the VN id. */
  onAdded?: (id: string) => void;
  /** Optional badge rendered on the poster (e.g. relation type). */
  badge?: { label: string; tone?: 'accent' | 'muted' };
}

function fmtMinutes(m: number | null | undefined): string | null {
  if (m == null || m <= 0) return null;
  const h = Math.floor(m / 60);
  const mn = m % 60;
  if (h && mn) return `${h}h ${mn}m`;
  if (h) return `${h}h`;
  return `${mn}m`;
}

export function VnCard({ data, selectable = false, selected = false, onSelect, enableAdd = false, onAdded, badge }: VnCardProps) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [addedLocal, setAddedLocal] = useState(false);
  const [, startTransition] = useTransition();
  const showAddButton = enableAdd && !selectable && !data.status && !data.inCollectionBadge && !addedLocal;
  const showAddedBadge = enableAdd && !selectable && (data.inCollectionBadge || addedLocal);

  async function handleAdd(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (adding) return;
    setAdding(true);
    try {
      const r = await fetch(`/api/collection/${data.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'planning' }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || t.common.error);
      }
      toast.success(t.toast.added);
      setAddedLocal(true);
      onAdded?.(data.id);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAdding(false);
    }
  }
  const ratingNum = data.user_rating ?? data.rating;
  const rating = ratingNum != null ? (ratingNum / 10).toFixed(1) : null;
  const year = data.released?.slice(0, 4);
  const myPlaytime = fmtMinutes(data.playtime_minutes);
  const vndbLength = fmtMinutes(data.length_minutes);
  const titlePair = useResolvedTitle(data.title, data.alttitle ?? null);

  const localSrc = data.customCover || data.localPoster || null;

  const className = `group relative flex flex-col overflow-hidden rounded-xl border bg-bg-card transition-all ${
    selectable
      ? `cursor-pointer ${selected ? 'border-accent ring-2 ring-accent shadow-card' : 'border-border hover:border-accent'}`
      : 'border-border hover:-translate-y-1 hover:border-accent hover:shadow-card'
  }`;

  const inner = (
    <>
      {selectable && (
        <span
          className={`absolute left-2 top-2 z-20 flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
            selected ? 'border-accent bg-accent text-bg' : 'border-white/60 bg-bg-card/80 text-transparent'
          }`}
          aria-hidden
        >
          <Check className="h-3 w-3" />
        </span>
      )}
      {data.favorite && (
        <Star
          aria-label="favorite"
          className={`absolute z-10 h-5 w-5 fill-accent text-accent drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] ${
            selectable ? 'right-2 top-2' : 'left-2 top-2'
          }`}
        />
      )}
      {!selectable && data.status && (
        <div className="absolute right-2 top-2 z-10">
          <StatusBadge status={data.status} />
        </div>
      )}
      {!selectable && (showAddedBadge) && (
        <span className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-status-completed px-2 py-0.5 text-[11px] font-bold text-bg">
          <CheckCheck className="h-3 w-3" aria-hidden />
          {t.search.inCollection}
        </span>
      )}
      {badge && (
        <span
          className={`absolute bottom-[calc(33%+0.5rem)] left-2 z-10 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-card ${
            badge.tone === 'muted'
              ? 'bg-bg-card/90 text-muted backdrop-blur'
              : 'bg-accent text-bg'
          }`}
        >
          {badge.label}
        </span>
      )}
      {!selectable && showAddButton && (
        <button
          type="button"
          onClick={handleAdd}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleAdd(e);
          }}
          disabled={adding}
          className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-md bg-accent/90 px-2 py-0.5 text-[11px] font-bold text-bg shadow-card opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-50"
          title={t.form.add}
        >
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {t.cardAdd}
        </button>
      )}
      <SafeImage
        src={data.poster}
        localSrc={localSrc}
        alt={data.title}
        sexual={data.sexual ?? null}
        className="aspect-[2/3] w-full"
      />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-2 text-sm font-semibold leading-tight" title={titlePair.sub ?? titlePair.main}>
          {titlePair.main}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          {rating && (
            <span
              className="inline-flex items-center gap-0.5 text-accent"
              title={data.user_rating != null ? t.detail.myRatingLabel : t.detail.lengthVndb}
            >
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
    </>
  );

  if (selectable) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.();
          }
        }}
        className={className}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link href={`/vn/${data.id}`} className={className}>
      {inner}
    </Link>
  );
}
