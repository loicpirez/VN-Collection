import { Gauge } from 'lucide-react';
import { getReadingSpeedProfile, predictReadingMinutes } from '@/lib/reading-speed';
import { getDict, getLocale } from '@/lib/i18n/server';
import { BCP47 } from '@/lib/locale-number';
import { formatMinutes } from '@/lib/format';

interface Props {
  vndbLength: number | null;
  egsLength: number | null;
}

/**
 * "VNDB: 16h / EGS: 12h / You: ~14h (x0.88)" - folds the three reference
 * times into one compact row. Hidden entirely when neither side has a value
 * (the parent already shows "-" in that case).
 */
export async function ReadingSpeedBadge({ vndbLength, egsLength }: Props) {
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const fmt = (m: number | null | undefined): string =>
    formatMinutes(m, locale, t.year, { fallback: '-' });
  const profile = getReadingSpeedProfile();
  const predicted = predictReadingMinutes(vndbLength, egsLength, profile);
  if (vndbLength == null && egsLength == null) return null;

  const multiplier = vndbLength != null
    ? profile.multiplierVsVndb
    : profile.multiplierVsEgs;

  return (
    <div className="mt-1 inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-muted">
      <span className="inline-flex items-center gap-1">
        <Gauge className="h-3 w-3 text-accent" aria-hidden />
        <span className="font-bold uppercase tracking-wider">{t.readingSpeed.label}</span>
      </span>
      <span>{t.readingSpeed.sourceVndb} <span className="font-semibold text-white/85">{fmt(vndbLength)}</span></span>
      <span>{t.readingSpeed.sourceEgs} <span className="font-semibold text-white/85">{fmt(egsLength)}</span></span>
      {predicted != null ? (
        <span title={t.readingSpeed.tooltip.replace('{n}', String(profile.sampleSize))}>
          {t.readingSpeed.you}: <span className="font-semibold text-accent">≈ {fmt(predicted)}</span>
          {multiplier != null && (
            <span className="ml-1 opacity-70">
              x{multiplier.toLocaleString(BCP47[locale], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
        </span>
      ) : (
        <span className="opacity-70" title={t.readingSpeed.notEnoughHint}>{t.readingSpeed.notEnough}</span>
      )}
    </div>
  );
}
