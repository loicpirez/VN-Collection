import Link from 'next/link';
import { getDict } from '@/lib/i18n/server';
import { getPeopleRepository } from '@/lib/db/repositories/people';
import { SafeImage } from './SafeImage';
import { SectionCountReport } from './vn-detail/DetailSectionFrame';

interface VaEntry {
  note?: string | null;
  character?: {
    id?: string;
    name?: string;
    original?: string | null;
    image?: { url?: string } | null;
  } | null;
  staff?: {
    id?: string;
    aid?: number;
    name?: string;
    original?: string | null;
    lang?: string | null;
  } | null;
}

export async function CastSection({ va }: { va: VaEntry[] }) {
  const t = await getDict();
  if (!va?.length) return null;
  const charIds = va.map((v) => v.character?.id).filter((id): id is string => !!id);
  const localImages = await getPeopleRepository().characterImages(charIds);

  return (
    <section className="p-4 sm:p-6">
      <SectionCountReport count={va.length} />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {va.map((v, i) => {
          const c = v.character;
          const s = v.staff;
          if (!c?.id || !c.name || !s?.id || !s.name) return null;
          const local = localImages.get(c.id);
          return (
            <li key={`${c.id}-${s.id}-${i}`} className="flex gap-3 rounded-lg border border-border bg-bg-elev/40 p-2">
              <Link
                href={`/character/${c.id}`}
                className="block h-20 w-14 shrink-0 overflow-hidden rounded"
                tabIndex={-1}
                aria-label={c.name}
              >
                <SafeImage
                  src={c.image?.url ?? null}
                  localSrc={local?.local_path ?? null}
                  alt={c.name}
                  className="h-full w-full"
                />
              </Link>
              <div className="min-w-0 flex-1 self-center">
                <Link
                  href={`/character/${c.id}`}
                  className="flex min-h-8 flex-col justify-center text-xs font-bold leading-tight hover:text-accent"
                  title={c.name}
                >
                  <span className="line-clamp-1">{c.name}</span>
                  {c.original && c.original !== c.name && (
                    <span className="line-clamp-1 text-[10px] font-normal text-muted" title={c.original}>{c.original}</span>
                  )}
                </Link>
                <Link
                  href={`/staff/${s.id}`}
                  className="mt-0.5 inline-flex min-h-8 items-center text-[11px] leading-tight text-muted hover:text-accent"
                  title={v.note ?? undefined}
                >
                  {t.characters.castLabel}: <span className="font-semibold">{s.name}</span>
                  {s.original && s.original !== s.name && (
                    <span className="ml-1 opacity-70">{s.original}</span>
                  )}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
