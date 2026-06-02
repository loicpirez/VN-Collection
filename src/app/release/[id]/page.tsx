import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { ArrowLeft, Boxes, ExternalLink, Globe, Languages, Mic2, Package, Shield } from 'lucide-react';
import { getRelease, type VndbRelease } from '@/lib/vndb';
import { getCollectionItem, getOwnedRelease, isInCollectionMany, upsertReleaseResolutionCache } from '@/lib/db';
import { getDict, getLocale } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { LangFlag } from '@/components/LangFlag';
import { ReleaseOwnedToggle } from '@/components/ReleaseOwnedToggle';
import { VndbMarkup } from '@/components/VndbMarkup';
import { safeHref } from '@/lib/safe-href';
import { platformLabel } from '@/lib/platform-label';
import { formatVndbDateString } from '@/lib/locale-number';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const release = await getRelease(id.toLowerCase()).catch(() => null);
  const name = release?.title ?? id;
  return { title: `${name} - ${t.releases.section}` };
}

const VOICED_KEY: Record<number, 'voiced1' | 'voiced2' | 'voiced3' | 'voiced4'> = {
  1: 'voiced1',
  2: 'voiced2',
  3: 'voiced3',
  4: 'voiced4',
};

function fmtRes(r: VndbRelease['resolution']): string | null {
  if (r == null) return null;
  if (typeof r === 'string') return r;
  return `${r[0]}x${r[1]}`;
}

const TYPE_LABEL: Record<string, 'pkgfront' | 'pkgback' | 'pkgcontent' | 'pkgside' | 'pkgmed' | 'dig'> = {
  pkgfront: 'pkgfront',
  pkgback: 'pkgback',
  pkgcontent: 'pkgcontent',
  pkgside: 'pkgside',
  pkgmed: 'pkgmed',
  dig: 'dig',
};

export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^r\d+$/i.test(id)) notFound();
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  let release: VndbRelease | null = null;
  let error: string | null = null;
  try {
    release = await getRelease(id);
  } catch (e) {
    error = (e as Error).message;
  }
  if (!release) notFound();
  // First-time visit caches the resolution for aspect-ratio filters.
  // Deferred via after() so the DB write runs after the response is
  // sent, preventing it from blocking or affecting the RSC render.
  // The operation is idempotent (UPSERT) so retries are safe (PAGE-019).
  const releaseId = release.id;
  const resolution = release.resolution;
  const releaseVns = release.vns;
  after(() => {
    for (const vn of releaseVns) {
      if (vn?.id) {
        upsertReleaseResolutionCache({ releaseId, vnId: vn.id, resolution });
      }
    }
    if (releaseVns.length === 0) {
      upsertReleaseResolutionCache({ releaseId, resolution });
    }
  });

  const voicedKey = release.voiced && VOICED_KEY[release.voiced] ? VOICED_KEY[release.voiced] : null;
  const flags: { label: string; tone?: 'good' | 'warn' }[] = [];
  if (release.official) flags.push({ label: t.releases.official });
  if (release.patch) flags.push({ label: t.releases.patch });
  if (release.freeware) flags.push({ label: t.releases.freeware });
  if (release.uncensored) flags.push({ label: t.releases.uncensored });
  if (release.has_ero) flags.push({ label: t.releases.hasEro, tone: 'warn' });

  const dev = release.producers.filter((p) => p.developer);
  const pub = release.producers.filter((p) => p.publisher);
  const firstVnId = release.vns[0]?.id;
  const res = fmtRes(release.resolution);

  // Parent VN cover used as fallback when the release has no images
  // of its own (common for digital / EGS-only releases that VNDB
  // hasn't mirrored a `pkgfront` for). `getCollectionItem` returns
  // any VN known locally regardless of collection membership.
  const parentVn = firstVnId ? getCollectionItem(firstVnId) : null;
  const parentCover = parentVn
    ? {
        url: parentVn.image_url ?? null,
        localPath: parentVn.local_image || parentVn.local_image_thumb || null,
        sexual: parentVn.image_sexual ?? null,
        title: parentVn.title,
      }
    : null;

  // Owned-inventory shortcut: if any of the VNs linked to this release is in
  // the collection, surface a quick toggle/edit panel here.
  const ownedSet = isInCollectionMany(release.vns.map((v) => v.id));
  const ownedContexts = release.vns
    .map((v) => ({
      vnId: v.id,
      vnTitle: v.title || v.id,
      vnRelation: v.rtype,
      inCollection: ownedSet.has(v.id),
      owned: getOwnedRelease(v.id, release.id),
    }));

  return (
    <div className="w-full">
      {firstVnId ? (
        <Link href={`/vn/${firstVnId}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t.releases.backToVn}
        </Link>
      ) : (
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t.nav.library}
        </Link>
      )}

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-baseline gap-2 text-2xl font-bold">
              <Boxes className="h-6 w-6 text-accent" aria-hidden />
              {release.title}
            </h1>
            {release.alttitle && release.alttitle !== release.title && (
              <div className="mt-1 text-muted">{release.alttitle}</div>
            )}
          </div>
          <a
            href={`https://vndb.org/${release.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn shrink-0"
          >
            <ExternalLink className="h-4 w-4" aria-hidden /> VNDB
          </a>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-3 text-sm sm:gap-x-6 sm:grid-cols-3">
          {release.released && (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted">{t.detail.released}</dt>
              <dd className="font-semibold">{formatVndbDateString(release.released, locale)}</dd>
            </div>
          )}
          {release.languages.length > 0 && (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted">
                <Languages className="mr-1 inline h-3 w-3" aria-hidden />
                {t.detail.languages}
              </dt>
              <dd className="flex flex-wrap items-baseline gap-1.5 text-sm font-semibold">
                {release.languages.map((l) => (
                  <span key={l.lang} className="inline-flex items-baseline gap-1">
                    <LangFlag lang={l.lang} withCode />
                    {l.mtl && <span className="text-[10px] text-muted">({t.releases.mtl})</span>}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {release.platforms.length > 0 && (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted">
                <Globe className="mr-1 inline h-3 w-3" aria-hidden />
                {t.detail.platforms}
              </dt>
              <dd className="font-semibold">{release.platforms.map(platformLabel).join(', ')}</dd>
            </div>
          )}
          {release.minage != null && (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted">
                <Shield className="mr-1 inline h-3 w-3" aria-hidden />
                {t.releases.ageRating}
              </dt>
              <dd className="font-semibold">{release.minage}+</dd>
            </div>
          )}
          {voicedKey && (
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">
                <Mic2 className="mr-1 inline h-3 w-3" aria-hidden />
                {t.releases.voicedLabel}
              </dt>
              <dd className="font-semibold">{t.releases[voicedKey]}</dd>
            </div>
          )}
          {res && (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted">{t.releases.resolution}</dt>
              <dd className="font-semibold">{res}</dd>
            </div>
          )}
          {release.engine && (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted">{t.releases.engine}</dt>
              <dd className="font-semibold">{release.engine}</dd>
            </div>
          )}
          {release.media.length > 0 && (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted">
                <Package className="mr-1 inline h-3 w-3" aria-hidden />
                {t.releases.media}
              </dt>
              <dd className="font-semibold">
                {release.media.map((m) => `${m.medium}${m.qty > 1 ? `x${m.qty}` : ''}`).join(', ')}
              </dd>
            </div>
          )}
          {release.gtin && (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted">{t.releases.gtin}</dt>
              <dd className="break-all font-mono text-xs font-semibold">{release.gtin}</dd>
            </div>
          )}
          {release.catalog && (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted">{t.releases.catalog}</dt>
              <dd className="break-all font-mono text-xs font-semibold">{release.catalog}</dd>
            </div>
          )}
        </dl>

        {(dev.length > 0 || pub.length > 0) && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {dev.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-muted">{t.detail.developers}</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {dev.map((p) => (
                    <Link
                      key={p.id}
                      href={`/producer/${p.id}`}
                      className="rounded-md border border-border bg-bg-elev px-2 py-0.5 text-xs hover:border-accent hover:text-accent"
                    >
                      {p.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {pub.length > 0 && (
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted">{t.detail.publishers}</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {pub.map((p) => (
                    <Link
                      key={p.id}
                      href={`/producer/${p.id}`}
                      className="rounded-md border border-border bg-bg-elev px-2 py-0.5 text-xs hover:border-accent hover:text-accent"
                    >
                      {p.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {flags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {flags.map((f) => (
              <span
                key={f.label}
                className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                  f.tone === 'warn' ? 'bg-status-dropped/20 text-status-dropped' : 'bg-accent/15 text-accent'
                }`}
              >
                {f.label}
              </span>
            ))}
          </div>
        )}

        {release.notes && (
          <div className="mt-4 rounded-lg border border-border bg-bg-elev/40 p-3 text-sm leading-relaxed text-white/85">
            <VndbMarkup text={release.notes} spoilerLabel={t.spoiler.markupSummary} />
          </div>
        )}

        {release.extlinks.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {release.extlinks.map((l) => {
              const href = safeHref(l.url);
              if (!href) return null;
              return (
                <a
                  key={l.url}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden /> {l.label}
                </a>
              );
            })}
          </div>
        )}
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      )}

      {ownedContexts.length > 0 && (
        <section className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
            {t.releases.inventoryShortcut}
          </h2>
          {release.vns.length > 1 && (
            <p className="mb-3 text-xs text-muted">{t.releases.multiVnInventoryHint}</p>
          )}
          <div className="space-y-2">
            {ownedContexts.map((ctx) => (
              <ReleaseOwnedToggle
                key={ctx.vnId}
                vnId={ctx.vnId}
                vnTitle={ctx.vnTitle}
                vnRelation={ctx.vnRelation}
                releaseId={release!.id}
                initialInCollection={ctx.inCollection}
                initialOwned={!!ctx.owned}
              />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t.media.section}</h2>
        {release.images.length === 0 ? (
          parentCover && (parentCover.url || parentCover.localPath) ? (
            // No release-level images - fall back to the parent VN
            // cover so the user gets a visual anchor instead of a
            // blank "no visuals" line. Marked explicitly as the VN's
            // cover so they know it isn't the release's own art.
            <figure className="mx-auto max-w-xs overflow-hidden rounded-lg border border-border bg-bg-elev">
              <div className="aspect-[2/3] w-full">
                <SafeImage
                  src={parentCover.url}
                  localSrc={parentCover.localPath}
                  sexual={parentCover.sexual}
                  alt={parentCover.title}
                  className="h-full w-full"
                  fit="cover"
                />
              </div>
              <figcaption className="px-2 py-1 text-center text-[10px] uppercase tracking-wider text-muted">
                {t.releases.parentVnCoverFallback}
              </figcaption>
            </figure>
          ) : (
            <p className="py-6 text-center text-sm text-muted">{t.releases.noVisuals}</p>
          )
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 180px)), 1fr))' }}
          >
            {release.images.map((img) => {
              const aspect = img.type === 'pkgmed' ? 'aspect-square' : img.type === 'dig' ? 'aspect-video' : 'aspect-[2/3]';
              const typeKey = TYPE_LABEL[img.type] ?? 'dig';
              return (
                <figure
                  key={`${img.id ?? img.url}`}
                  className="overflow-hidden rounded-lg border border-border bg-bg-elev"
                >
                  <div className={`${aspect} w-full`}>
                    <SafeImage
                      src={img.url}
                      sexual={img.sexual ?? null}
                      alt={`${release.title} - ${t.media[typeKey]}`}
                      className="h-full w-full"
                      fit="contain"
                    />
                  </div>
                  <figcaption className="flex items-center justify-between gap-2 px-2 py-1 text-[10px] text-muted">
                    <span className="font-bold uppercase tracking-wider">{t.media[typeKey]}</span>
                    {img.languages && img.languages.length > 0 && (
                      <span>{img.languages.slice(0, 4).join(', ')}</span>
                    )}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
