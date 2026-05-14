'use client';
import Link from 'next/link';
import { useDisplaySettings } from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';
import type { VndbCharacter } from '@/lib/vndb';

interface Props {
  char: Pick<VndbCharacter, 'id' | 'sex' | 'gender' | 'traits'>;
}

/**
 * Renders the spoiler-sensitive parts of the character page (extra sex /
 * gender lines, trait list) using the global spoiler-level setting
 * configured via <SpoilerToggle/> in the header. Lives in its own client
 * component so the parent character page can stay server-rendered.
 *
 * Mirrors VNDB's model: spoilerLevel=0 hides spoilers; =1 minor; =2 all.
 * Sexual traits use a separate toggle (showSexualTraits) since users
 * often want to see story spoilers without unblurring NSFW data.
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

  const visibleTraits = (char.traits ?? []).filter((tr) => {
    if (tr.spoiler > level) return false;
    if (!showSexual && tr.sexual) return false;
    return true;
  });
  const hiddenTraitCount = (char.traits ?? []).length - visibleTraits.length;

  return (
    <>
      {level > 0 && (sexB && sexB !== sexA) && (
        <p className="mt-1 text-[11px] text-status-on_hold">
          <span className="font-bold uppercase tracking-wider">{t.characters.sexReal}:</span> {labelSex(sexB)}
        </p>
      )}
      {level > 0 && (genderB && genderB !== genderA) && (
        <p className="mt-0.5 text-[11px] text-status-on_hold">
          <span className="font-bold uppercase tracking-wider">{t.characters.genderReal}:</span> {labelGender(genderB)}
        </p>
      )}
      {(char.traits ?? []).length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{t.characters.traits}</h3>
            <p className="text-[10px] text-muted">
              {t.spoiler.title}: {level === 0 ? t.spoiler.lvl0 : level === 1 ? t.spoiler.lvl1 : t.spoiler.lvl2}
              {hiddenTraitCount > 0 && <span className="ml-1">· +{hiddenTraitCount}</span>}
            </p>
          </div>
          {visibleTraits.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {visibleTraits.map((tr) => (
                <Link
                  key={tr.id}
                  href={`/trait/${encodeURIComponent(tr.id)}`}
                  className={`rounded-md border bg-bg-elev px-2 py-0.5 text-[11px] transition-colors hover:border-accent hover:text-accent ${
                    tr.spoiler > 0
                      ? 'border-status-on_hold/40 text-status-on_hold'
                      : tr.sexual
                        ? 'border-status-dropped/40 text-status-dropped'
                        : 'border-border text-muted'
                  }`}
                  title={tr.spoiler > 0 ? t.characters.spoilerBadge : tr.lie ? t.characters.traitLie : undefined}
                >
                  {tr.group_name && <span className="opacity-60">{tr.group_name} / </span>}
                  {tr.name ?? tr.id}
                  {tr.lie && <span className="ml-1 text-[9px]">⚠</span>}
                  {tr.spoiler > 0 && <span className="ml-1 text-[9px]">!</span>}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted">{hiddenTraitCount} hidden — adjust spoiler toggle in header</p>
          )}
        </section>
      )}
    </>
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
