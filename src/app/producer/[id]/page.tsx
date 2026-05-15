import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getProducer as getProducerLocal, producerOwnershipSummary, upsertProducer } from '@/lib/db';
import { getProducer as fetchProducer } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { ProducerLogo } from '@/components/ProducerLogo';
import { ProducerLogoUpload } from '@/components/ProducerLogoUpload';
import { VndbMarkup } from '@/components/VndbMarkup';
import { ProducerVnsSections } from '@/components/ProducerVnsSections';
import { readScrapedProducerInfo } from '@/lib/scrape-producer-relations';
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

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const local = getProducerLocal(id);
  return local?.name ? { title: local.name } : {};
}

export default async function ProducerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^p\d+$/i.test(id)) notFound();
  const t = await getDict();
  let producer = await loadProducer(id);
  // One focused query instead of two full `listCollection` scans:
  // returns the in-collection vn ids credited to this producer in
  // either role + the first row's developer/publisher arrays for the
  // fallback name path.
  const { ownedIds, sample: ownedSample } = producerOwnershipSummary(id);
  if (!producer) {
    const sample =
      ownedSample?.developers?.find((d) => d.id === id) ??
      ownedSample?.publishers?.find((p) => p.id === id);
    if (!sample && ownedIds.size === 0) notFound();
    producer = {
      id,
      name: sample?.name ?? id,
      original: null,
      lang: null,
      type: null,
      description: null,
      aliases: [],
      extlinks: [],
      logo_path: null,
      fetched_at: 0,
    };
  }
  const typeKey = producer.type ? TYPE_KEY[producer.type] : null;

  return (
    <div>
      <Link href="/producers" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.producers.back}
      </Link>

      <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-bg-card p-4 sm:flex-row sm:items-start sm:p-6">
        <ProducerLogo producer={producer} size={96} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{producer.name}</h1>
          {producer.original && producer.original !== producer.name && (
            <div className="text-sm text-muted">{producer.original}</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {typeKey && (
              <span className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-muted">
                {t.producers[typeKey]}
              </span>
            )}
            {producer.lang && (
              <span className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-muted">
                {producer.lang.toUpperCase()}
              </span>
            )}
            <span className="text-muted">
              {ownedIds.size} {t.producers.vnCount}
            </span>
          </div>
          {producer.aliases.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">{t.producers.aliases}</div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                {producer.aliases.map((a) => (
                  <span key={a} className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-white/85">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="mb-4">
        <ProducerLogoUpload producerId={producer.id} hasLogo={!!producer.logo_path} />
      </div>

      {producer.description && (
        <section className="mb-8 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">{t.detail.synopsis}</h3>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">
            <VndbMarkup text={producer.description} />
          </div>
        </section>
      )}

      <section className="mb-8 flex flex-wrap gap-2">
        <a
          href={`https://vndb.org/${producer.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
        >
          <ExternalLink className="h-3.5 w-3.5" /> VNDB
        </a>
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

      <Suspense fallback={<ProducerVnsSkeleton />}>
        <ProducerVnsSections producerId={producer.id} />
      </Suspense>

      <ProducerScrapedRelations pid={producer.id} t={t} />
    </div>
  );
}

function ProducerVnsSkeleton() {
  return (
    <section className="mb-8 space-y-6 animate-pulse">
      <div className="h-6 w-64 rounded bg-bg-elev/60" />
      <div className="rounded-2xl border border-border bg-bg-card p-4 sm:p-5">
        <div className="mb-4 h-4 w-40 rounded bg-bg-elev/60" />
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-2 rounded-lg border border-border bg-bg-elev/40 p-2">
              <div className="h-16 w-11 shrink-0 rounded bg-bg-elev/60" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 rounded bg-bg-elev/60" />
                <div className="h-2 w-1/2 rounded bg-bg-elev/60" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-bg-card p-4 sm:p-5">
        <div className="mb-4 h-4 w-40 rounded bg-bg-elev/60" />
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-2 rounded-lg border border-border bg-bg-elev/40 p-2">
              <div className="h-16 w-11 shrink-0 rounded bg-bg-elev/60" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 rounded bg-bg-elev/60" />
                <div className="h-2 w-1/2 rounded bg-bg-elev/60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


/**
 * Renders the parent/subsidiary/spawned/imprint relations VNDB exposes
 * only on the web UI. Data is populated by the producer-scrape fan-out
 * (`scrapeProducersForVn`) when the user runs "Download all". The block
 * is hidden when nothing has been scraped yet so we don't show a stale
 * empty state.
 */
function ProducerScrapedRelations({ pid, t }: { pid: string; t: Awaited<ReturnType<typeof getDict>> }) {
  const info = readScrapedProducerInfo(pid);
  if (!info || info.relations.length === 0) return null;
  return (
    <section className="mb-8 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t.producers.scrapedRelations}</h3>
      <ul className="grid gap-2 text-xs sm:grid-cols-2">
        {info.relations.map((r) => (
          <li key={`${r.relation}-${r.id}`} className="flex items-baseline gap-2">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted">{r.relation}</span>
            <Link href={`/producer/${r.id}`} className="font-semibold hover:text-accent">
              {r.name}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-muted/70">
        {t.producers.scrapedRelationsHint}
      </p>
    </section>
  );
}
