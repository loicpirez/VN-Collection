import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, CornerDownRight, ExternalLink, Sparkles } from 'lucide-react';
import { getCharactersForTrait, getTrait, type VndbCharacter, type VndbTrait } from '@/lib/vndb';
import { getCharacterImages, listInCollectionVnIds } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { stripVndbMarkup } from '@/components/VndbMarkup';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';

export const dynamic = 'force-dynamic';


export default async function TraitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mine?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const mineOnly = sp.mine === '1';
  if (!/^i\d+$/i.test(id)) notFound();
  const t = await getDict();
  let trait: VndbTrait | null = null;
  let characters: VndbCharacter[] = [];
  let error: string | null = null;
  try {
    [trait, characters] = await Promise.all([
      getTrait(id),
      getCharactersForTrait(id, { results: 60 }),
    ]);
  } catch (e) {
    error = (e as Error).message;
  }
  if (!trait) notFound();

  const ownedVnIds = new Set(listInCollectionVnIds());
  const allCount = characters.length;
  const mineCount = characters.filter((c) => c.vns.some((v) => ownedVnIds.has(v.id))).length;
  const visible = mineOnly
    ? characters.filter((c) => c.vns.some((v) => ownedVnIds.has(v.id)))
    : characters;
  const localPaths = getCharacterImages(visible.map((c) => c.id));

  return (
    <DensityScopeProvider scope="characterWorks" className="mx-auto max-w-5xl">
      <Link href="/traits" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" /> {t.nav.traits}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-baseline gap-2 text-2xl font-bold">
              <Sparkles className="h-6 w-6 text-accent" aria-hidden />
              {trait.group_name && <span className="text-muted">{trait.group_name} /</span>}
              {trait.name}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>{trait.char_count.toLocaleString()} {t.traits.charCount}</span>
              {trait.aliases.length > 0 && <span>· {trait.aliases.slice(0, 4).join(', ')}</span>}
              {trait.sexual && (
                <span className="rounded bg-status-dropped/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-status-dropped">
                  R18
                </span>
              )}
            </div>
            {trait.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/85">
                {stripVndbMarkup(trait.description)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Density slider controls the character grid below. */}
            <CardDensitySlider scope="characterWorks" />
            <a
              href={`https://vndb.org/${trait.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              <ExternalLink className="h-4 w-4" aria-hidden /> VNDB
            </a>
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
            {t.traits.charactersWith} · {visible.length}
            {mineOnly && (
              <span className="text-[10px] font-normal opacity-70">
                · {mineCount} / {allCount} {t.traits.mineCountSuffix}
              </span>
            )}
          </h2>
          <div className="inline-flex rounded-md border border-border bg-bg-elev/30 p-0.5 text-[11px]">
            <Link
              href={`/trait/${id}`}
              className={`rounded px-2 py-1 transition-colors ${
                !mineOnly ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
              }`}
            >
              {t.traits.all} · {allCount}
            </Link>
            <Link
              href={`/trait/${id}?mine=1`}
              className={`rounded px-2 py-1 transition-colors ${
                mineOnly ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
              }`}
            >
              {t.traits.mine} · {mineCount}
            </Link>
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {mineOnly ? t.traits.mineEmpty : t.search.noResults}
          </p>
        ) : (
          <ul
            className="grid gap-3"
            // Honour the shared density variable instead of pinning
            // 180px so the per-page slider tunes the column floor.
            style={{
              gridTemplateColumns:
                'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))',
            }}
          >
            {visible.map((c) => {
              const owned = c.vns.find((v) => ownedVnIds.has(v.id));
              const firstVn = owned ?? c.vns[0];
              return (
                <li key={c.id}>
                  <Link
                    href={`/character/${c.id}`}
                    className={`group flex gap-3 rounded-lg border bg-bg-elev/40 p-2 transition-colors hover:border-accent ${
                      owned ? 'border-accent/40' : 'border-border'
                    }`}
                  >
                    {/* Density-aware character cover. */}
                    <div
                      className="shrink-0 overflow-hidden rounded"
                      style={{
                        width: 'clamp(64px, calc(var(--card-density-px, 220px) * 0.32), 160px)',
                        aspectRatio: '2 / 3',
                      }}
                    >
                      <SafeImage
                        src={c.image?.url ?? null}
                        localSrc={localPaths.get(c.id)?.local_path ?? null}
                        sexual={c.image?.sexual ?? null}
                        alt={c.name}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">
                        {c.name}
                      </span>
                      {c.original && c.original !== c.name && (
                        <div className="mt-0.5 line-clamp-1 text-[10px] text-muted">{c.original}</div>
                      )}
                      {firstVn && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted">
                          <CornerDownRight className="h-2.5 w-2.5" aria-hidden />
                          <span className="line-clamp-1">{firstVn.title ?? firstVn.id}</span>
                          {owned && <Check className="h-2.5 w-2.5 text-accent" aria-hidden />}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </DensityScopeProvider>
  );
}
