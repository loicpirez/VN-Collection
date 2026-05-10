import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getProducer as getProducerLocal, listCollection, upsertProducer } from '@/lib/db';
import { getProducer as fetchProducer } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { ProducerLogo } from '@/components/ProducerLogo';
import { ProducerLogoUpload } from '@/components/ProducerLogoUpload';
import { VnGrid } from '@/components/VnGrid';
import type { ProducerRow } from '@/lib/types';

export const dynamic = 'force-dynamic';
const CACHE_MS = 24 * 3600 * 1000;

async function loadProducer(id: string): Promise<ProducerRow | null> {
  const cached = getProducerLocal(id);
  if (cached && Date.now() - cached.fetched_at < CACHE_MS) return cached;
  try {
    const fresh = await fetchProducer(id);
    if (!fresh) return cached;
    upsertProducer(fresh);
    return getProducerLocal(id);
  } catch {
    return cached;
  }
}

const TYPE_KEY: Record<string, 'type_co' | 'type_in' | 'type_ng'> = {
  co: 'type_co',
  in: 'type_in',
  ng: 'type_ng',
};

export default async function ProducerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^p\d+$/i.test(id)) notFound();
  const t = await getDict();
  const producer = await loadProducer(id);
  if (!producer) notFound();
  const items = listCollection({ producer: id, sort: 'updated_at' });
  const typeKey = producer.type ? TYPE_KEY[producer.type] : null;

  return (
    <div>
      <Link href="/producers" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.producers.back}
      </Link>

      <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-bg-card p-6 sm:flex-row sm:items-center">
        <ProducerLogo producer={producer} size={96} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{producer.name}</h1>
          {producer.original && producer.original !== producer.name && (
            <div className="text-sm text-muted">{producer.original}</div>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
            {typeKey && <span>{t.producers[typeKey]}</span>}
            {producer.lang && <span>{producer.lang.toUpperCase()}</span>}
            <span>
              {items.length} {t.producers.vnCount}
            </span>
          </div>
          {producer.aliases.length > 0 && (
            <div className="mt-1 text-xs text-muted">
              {producer.aliases.slice(0, 6).join(' · ')}
            </div>
          )}
        </div>
      </header>

      <div className="mb-4">
        <ProducerLogoUpload producerId={producer.id} hasLogo={!!producer.logo_path} />
      </div>

      {producer.description && (
        <section className="mb-8 rounded-xl border border-border bg-bg-card p-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">{t.detail.synopsis}</h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{stripBbCode(producer.description)}</p>
        </section>
      )}

      {producer.extlinks.length > 0 && (
        <section className="mb-8 flex flex-wrap gap-2">
          {producer.extlinks.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              <ExternalLink className="h-3.5 w-3.5" /> {l.label}
            </a>
          ))}
        </section>
      )}

      <VnGrid items={items} emptyMessage={t.library.empty.descriptionFiltered} />
    </div>
  );
}

function stripBbCode(s: string): string {
  return s.replace(/\[url=([^\]]+)\]([^[]+)\[\/url\]/g, '$2').replace(/\[\/?[a-z]+\]/gi, '');
}
