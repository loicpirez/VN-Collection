'use client';
import { memo } from 'react';
import { Check } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { StatusIcon } from '../StatusIcon';
import { DateInput } from '../DateInput';
import { STATUSES, type Status } from '@/lib/types';

interface Props {
  status: Status;
  onStatusChange: (next: Status) => void;
  userRating: string;
  userRatingInvalid: boolean;
  onUserRatingChange: (next: string) => void;
  playtime: string;
  playtimeInvalid: boolean;
  onPlaytimeChange: (next: string) => void;
  favorite: boolean;
  onFavoriteChange: (next: boolean) => void;
  started: string;
  onStartedChange: (next: string) => void;
  finished: string;
  onFinishedChange: (next: string) => void;
}

/**
 * P-157: memoized "My tracking" field group (status, rating, playtime,
 * favorite, started/finished dates). State stays in EditForm; this block
 * only receives values plus stable setters, so a keystroke in a sibling
 * group (notes, editions) does not re-render these inputs.
 */
export const TrackingFields = memo(function TrackingFields({
  status,
  onStatusChange,
  userRating,
  userRatingInvalid,
  onUserRatingChange,
  playtime,
  playtimeInvalid,
  onPlaytimeChange,
  favorite,
  onFavoriteChange,
  started,
  onStartedChange,
  finished,
  onFinishedChange,
}: Props) {
  const t = useT();
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{t.form.myTracking}</h3>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elev px-2.5 py-1 text-[10px] font-medium text-muted">
          <Check className="h-3 w-3 text-status-completed" aria-hidden />
          {t.form.autoSaveBadge}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="label">{t.form.status}</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <StatusIcon status={status} className="h-4 w-4" />
            </span>
            <select className="input pl-9" value={status} onChange={(e) => onStatusChange(e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{t.status[s]}</option>
              ))}
            </select>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="label">{t.form.myRating}</span>
          <input
            className={`input ${userRatingInvalid ? 'border-status-dropped ring-1 ring-status-dropped' : ''}`}
            type="number"
            inputMode="numeric"
            min={10}
            max={100}
            step={1}
            value={userRating}
            aria-invalid={userRatingInvalid || undefined}
            aria-describedby={userRatingInvalid ? 'edit-rating-error' : undefined}
            onChange={(e) => onUserRatingChange(e.target.value)}
          />
          {userRatingInvalid && (
            <span id="edit-rating-error" className="text-[11px] text-status-dropped">
              {t.form.errors.ratingRange}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="label">{t.form.playtimeMinutes}</span>
          <input
            className={`input ${playtimeInvalid ? 'border-status-dropped ring-1 ring-status-dropped' : ''}`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={playtime}
            aria-invalid={playtimeInvalid || undefined}
            aria-describedby={playtimeInvalid ? 'edit-playtime-error' : undefined}
            onChange={(e) => onPlaytimeChange(e.target.value)}
          />
          {playtimeInvalid && (
            <span id="edit-playtime-error" className="text-[11px] text-status-dropped">
              {t.form.errors.playtimeInvalid}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="label">{t.form.favorite}</span>
          <select className="input" value={favorite ? '1' : '0'} onChange={(e) => onFavoriteChange(e.target.value === '1')}>
            <option value="0">{t.common.no}</option>
            <option value="1">{t.form.favoriteYes}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="label">{t.form.startedDate}</span>
          <DateInput value={started} onChange={onStartedChange} ariaLabel={t.form.startedDate} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="label">{t.form.finishedDate}</span>
          <DateInput value={finished} onChange={onFinishedChange} ariaLabel={t.form.finishedDate} />
        </label>
      </div>
    </div>
  );
});
