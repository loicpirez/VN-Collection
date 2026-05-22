'use client';
import { useState } from 'react';
import { ChevronDown, ChevronUp, Star } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface ScoreTileProps {
  label: string;
  value: string;
  meta: string;
}

function ScoreTile({ label, value, meta }: ScoreTileProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-bg-elev/30 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-base font-bold text-white">{value}</div>
      <div className="text-[10px] text-muted">{meta}</div>
    </div>
  );
}

interface Props {
  unifiedRating: number | null;
  unifiedRatingSource: string;
  vndbRating: number | null;
  egsRating: number | null;
  vndbAverage: number | null;
  userRating: number | null;
  votecount: number;
  formattedVotecount: string;
  ratingOf10: string;
  votes: string;
}

function fmtScore10(score: number | null | undefined): string {
  return score == null ? '—' : (score / 10).toFixed(1);
}

function fmtScore100(score: number | null | undefined): string {
  return score == null ? '—' : String(Math.round(score));
}

export function ScoreSection({
  unifiedRating,
  unifiedRatingSource,
  vndbRating,
  egsRating,
  vndbAverage,
  userRating,
  formattedVotecount,
  ratingOf10,
  votes,
}: Props) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Star className="h-5 w-5 shrink-0 fill-accent text-accent" aria-hidden />
        <span className="text-2xl font-bold tabular-nums text-accent">
          {fmtScore10(unifiedRating)}
        </span>
        <span className="text-sm text-muted">{ratingOf10}</span>
        <span className="text-[11px] text-muted/70">· {unifiedRatingSource}</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
        >
          {expanded
            ? <><ChevronUp className="h-3 w-3" aria-hidden /> {t.detail.scoreHideBreakdown}</>
            : <><ChevronDown className="h-3 w-3" aria-hidden /> {t.detail.scoreShowBreakdown}</>
          }
        </button>
      </div>
      {expanded && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <ScoreTile
            label={t.detail.scoreVndb}
            value={`${fmtScore10(vndbRating)}${ratingOf10}`}
            meta={`${formattedVotecount} ${votes}`}
          />
          <ScoreTile
            label={t.detail.scoreEgs}
            value={`${fmtScore100(egsRating)} / 100`}
            meta={egsRating == null ? t.detail.scoreUnavailable : t.detail.scoreEgsMedian}
          />
          <ScoreTile
            label={t.detail.scoreVndbRaw}
            value={`${fmtScore10(vndbAverage)}${ratingOf10}`}
            meta={vndbAverage == null ? t.detail.scoreUnavailable : t.detail.scoreVndbRawHint}
          />
          <ScoreTile
            label={t.detail.myRatingLabel}
            value={`${fmtScore10(userRating)}${ratingOf10}`}
            meta={userRating == null ? t.detail.scoreUnavailable : t.detail.scoreMineHint}
          />
        </div>
      )}
    </>
  );
}
