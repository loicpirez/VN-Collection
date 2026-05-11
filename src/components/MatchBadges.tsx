import { CircleCheck, CircleSlash, Database, Sparkles } from 'lucide-react';
import type { EgsRow } from '@/lib/db';
import type { Dictionary } from '@/lib/i18n/dictionaries';

interface Props {
  /** Whether the VN row is a synthetic EGS-only entry (no VNDB id). */
  egsOnly: boolean;
  egs: EgsRow | null;
  /** Locale dictionary so this stays a server component (no useT hook). */
  t: Dictionary;
}

/**
 * Tiny inline indicator at the top of /vn/[id] showing where the data came from:
 * VNDB ✓ / EGS ✓ (+ how it was matched: extlink, search, manual). Server-rendered
 * so the badge state is correct on first paint (no flash).
 */
export function MatchBadges({ egsOnly, egs, t }: Props) {
  const egsMatched = !!egs?.egs_id;
  const egsSource = egs?.source ?? null;
  const egsSourceLabel = egsSource === 'extlink'
    ? t.matchBadges.viaExtlink
    : egsSource === 'search'
      ? t.matchBadges.viaSearch
      : egsSource === 'manual'
        ? t.matchBadges.viaManual
        : null;

  return (
    <div className="mb-3 inline-flex flex-wrap items-center gap-1.5">
      <Badge
        active={!egsOnly}
        icon={<Database className="h-3 w-3" aria-hidden />}
        label="VNDB"
        sub={egsOnly ? t.matchBadges.egsOnlyEntry : null}
        tone="vndb"
      />
      <Badge
        active={egsMatched}
        icon={<Sparkles className="h-3 w-3" aria-hidden />}
        label="ErogameScape"
        sub={egsMatched ? egsSourceLabel : t.matchBadges.noEgsMatch}
        tone="egs"
      />
    </div>
  );
}

function Badge({
  active,
  icon,
  label,
  sub,
  tone,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  sub: string | null;
  tone: 'vndb' | 'egs';
}) {
  const accent = tone === 'vndb' ? 'border-accent-blue/40 text-accent-blue' : 'border-accent/40 text-accent';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border bg-bg-elev/40 px-2 py-1 text-[11px] ${
        active ? accent : 'border-border text-muted'
      }`}
    >
      {icon}
      <span className="font-bold">{label}</span>
      {active ? (
        <CircleCheck className={`h-3 w-3 ${tone === 'vndb' ? 'text-accent-blue' : 'text-accent'}`} aria-hidden />
      ) : (
        <CircleSlash className="h-3 w-3 text-muted/60" aria-hidden />
      )}
      {sub && <span className="ml-0.5 text-[10px] font-normal text-muted">· {sub}</span>}
    </span>
  );
}
