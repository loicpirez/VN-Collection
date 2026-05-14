import Link from 'next/link';
import { Mic2 } from 'lucide-react';
import { getDict } from '@/lib/i18n/server';
import { getCharacterImages } from '@/lib/db';
import { SafeImage } from './SafeImage';

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
  const localImages = getCharacterImages(charIds);

  return (
    <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
      <h3 className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
        <Mic2 className="h-4 w-4 text-accent" /> {t.staff.cast}
        <span className="text-[11px] font-normal lowercase tracking-normal text-muted">· {va.length}</span>
      </h3>
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
              >
                <SafeImage
                  src={c.image?.url ?? null}
                  localSrc={local?.local_path ?? null}
                  alt={c.name}
                  className="h-full w-full"
                />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/character/${c.id}`} className="line-clamp-2 text-xs font-bold hover:text-accent">
                  {c.name}
                </Link>
                {c.original && c.original !== c.name && (
                  <div className="line-clamp-1 text-[10px] text-muted">{c.original}</div>
                )}
                <Link
                  href={`/staff/${s.id}`}
                  className="mt-1 inline-block text-[11px] text-muted hover:text-accent"
                  title={v.note ?? undefined}
                >
                  CV: <span className="font-semibold">{s.name}</span>
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
