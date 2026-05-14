'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useDisplaySettings } from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';
import { SpoilerChip } from './SpoilerChip';
import type { VndbCharacter } from '@/lib/vndb';

interface Props {
  char: Pick<VndbCharacter, 'id' | 'sex' | 'gender' | 'traits'>;
}

/**
 * Spoiler-sensitive part of the character page rendered client-side so
 * it can read the global <SpoilerToggle/> setting plus per-field local
 * reveal state (sex / gender spoiler line, individual trait chips).
 *
 * Per-field reveal: each spoiler-tagged trait renders as a redacted chip
 * via <SpoilerChip/>; click to unblur just that trait. The "spoiler sex"
 * and "spoiler gender" lines each have their own click-to-reveal button
 * so the user can flip them individually without changing the global
 * level.
 */
export function CharacterMetaClient({ char }: Props) {
  const t = useT();
  const { settings } = useDisplaySettings();
  const level = settings.spoilerLevel;
  const showSexual = settings.showSexualTraits;

  const sexA = char.sex?.[0] ?? null;
  const sexB = char.sex?.[1] ?? null;
  const genderA = char.gender?.[0] ?? null;
  const genderB = char.gender?.[1] ?? null;

  const sexDiffers = !!sexB && sexB !== sexA;
  const genderDiffers = !!genderB && genderB !== genderA;

  return (
    <>
      {sexDiffers && (
        <InlineSpoilerReveal
          label={t.characters.sexReal}
          value={labelSex(sexB)}
          autoReveal={level > 0}
        />
      )}
      {genderDiffers && (
        <InlineSpoilerReveal
          label={t.characters.genderReal}
          value={labelGender(genderB)}
          autoReveal={level > 0}
        />
      )}
      {(char.traits ?? []).length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{t.characters.traits}</h3>
            <p className="text-[10px] text-muted">
              {t.spoiler.title}: {level === 0 ? t.spoiler.lvl0 : level === 1 ? t.spoiler.lvl1 : t.spoiler.lvl2}
              {!showSexual && ' · -' + t.spoiler.showSexual}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(char.traits ?? []).map((tr) => (
              <SpoilerChip
                key={tr.id}
                level={tr.spoiler}
                sexual={tr.sexual}
                lie={tr.lie}
                currentSpoilerLevel={level}
                showSexual={showSexual}
                href={`/trait/${encodeURIComponent(tr.id)}`}
              >
                {tr.group_name && <span className="opacity-60">{tr.group_name} / </span>}
                {tr.name ?? tr.id}
              </SpoilerChip>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function InlineSpoilerReveal({
  label,
  value,
  autoReveal,
}: {
  label: string;
  value: string | null;
  autoReveal: boolean;
}) {
  const t = useT();
  const [revealed, setRevealed] = useState(autoReveal);
  if (!value) return null;
  return (
    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-status-on_hold">
      <span className="font-bold uppercase tracking-wider">{label}:</span>
      {revealed ? (
        <span>{value}</span>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="inline-flex items-center gap-1 rounded border border-dashed border-status-on_hold/60 bg-bg-elev/40 px-1.5 py-0.5 text-status-on_hold/80 hover:border-status-on_hold hover:text-status-on_hold"
          aria-label={t.spoiler.revealOne}
        >
          <EyeOff className="h-3 w-3" />
          <span className="font-mono">█████</span>
        </button>
      )}
      {revealed && (
        <button
          type="button"
          onClick={() => setRevealed(false)}
          className="ml-1 text-muted/70 hover:text-muted"
          aria-label={t.spoiler.hideOne}
        >
          <Eye className="h-3 w-3" />
        </button>
      )}
    </p>
  );
}

function labelSex(s: string | null): string | null {
  if (!s) return null;
  const map: Record<string, string> = { m: '♂', f: '♀', b: '♂♀', n: '∅' };
  return map[s] ?? s;
}
function labelGender(g: string | null): string | null {
  if (!g) return null;
  const map: Record<string, string> = { m: '♂', f: '♀', o: 'non-binary', a: 'ambiguous' };
  return map[g] ?? g;
}
