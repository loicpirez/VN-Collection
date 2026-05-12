import Link from 'next/link';
import { CloudDownload, Star } from 'lucide-react';
import { isInCollection } from '@/lib/db';
import { downloadFullStaffInfo, readStaffFullCache } from '@/lib/staff-full';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { SkeletonCardGrid } from '@/components/Skeleton';

/**
 * "More credits (outside your collection)" — the VNDB-sourced list of VNs
 * this staff/VA appears in. This component performs the network fetch when
 * the cache is empty; wrap it in <Suspense fallback={<StaffExtraCreditsSkeleton/>}>
 * so the staff page paints with the locally-known credits first and the
 * extra section streams in once the upstream request resolves.
 */
export async function StaffExtraCredits({
  sid,
  knownProdVnIds,
  knownVaVnIds,
}: {
  sid: string;
  knownProdVnIds: Set<string>;
  knownVaVnIds: Set<string>;
}) {
  const t = await getDict();

  let fullCache = readStaffFullCache(sid);
  if (!fullCache) {
    try {
      fullCache = await downloadFullStaffInfo(sid);
    } catch {
      fullCache = null;
    }
  }
  const extraProduction = (fullCache?.productionCredits ?? []).filter((c) => !knownProdVnIds.has(c.id));
  const extraVoice = (fullCache?.vaCredits ?? []).filter((c) => !knownVaVnIds.has(c.id));

  if (extraProduction.length === 0 && extraVoice.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-border bg-bg-card p-6">
      <h2 className="mb-1 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
        <CloudDownload className="h-4 w-4 text-accent" /> {t.staff.extraTitle}
        <span className="text-[11px] font-normal lowercase tracking-normal text-muted">
          · {extraProduction.length + extraVoice.length}
        </span>
      </h2>
      <p className="mb-4 text-[11px] text-muted">{t.staff.extraSubtitle}</p>
      {extraVoice.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t.staff.voiceCredits}</h3>
          <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {extraVoice.map((c) => (
              <li key={c.id}>
                <ExternalVnCard
                  vn={{ id: c.id, title: c.title, alttitle: c.alttitle, released: c.released, rating: c.rating, image_url: c.image_url, image_thumb: c.image_thumb }}
                  inCollection={isInCollection(c.id)}
                >
                  <ul className="mt-2 space-y-1 text-[11px] text-muted">
                    {c.characters.map((ch) => (
                      <li key={ch.id} className="flex items-baseline justify-between gap-2">
                        <Link href={`/character/${ch.id}`} className="truncate font-semibold text-white/85 hover:text-accent">
                          {ch.name}
                        </Link>
                        {ch.note && <span className="shrink-0 text-[10px] opacity-70">{ch.note}</span>}
                      </li>
                    ))}
                  </ul>
                </ExternalVnCard>
              </li>
            ))}
          </ul>
        </div>
      )}
      {extraProduction.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t.staff.productionCredits}</h3>
          <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {extraProduction.map((c) => (
              <li key={c.id}>
                <ExternalVnCard
                  vn={{ id: c.id, title: c.title, alttitle: c.alttitle, released: c.released, rating: c.rating, image_url: c.image_url, image_thumb: c.image_thumb }}
                  inCollection={isInCollection(c.id)}
                >
                  <div className="mt-1 text-[10px] text-muted">
                    {c.roles.map((r) => r.role).join(' · ')}
                  </div>
                </ExternalVnCard>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Placeholder card grid shown while the staff payload downloads. Keeps the
 * spot "this is loading" visible instead of leaving the page silently empty.
 */
export function StaffExtraCreditsSkeleton() {
  return (
    <section className="mt-6 rounded-xl border border-border bg-bg-card p-6">
      <div className="mb-3 h-3 w-48 animate-pulse rounded bg-bg-elev/60" />
      <div className="mb-4 h-2.5 w-72 animate-pulse rounded bg-bg-elev/60" />
      <SkeletonCardGrid count={8} />
    </section>
  );
}

function ExternalVnCard({
  vn,
  inCollection,
  children,
}: {
  vn: {
    id: string;
    title: string;
    alttitle: string | null;
    image_url: string | null;
    image_thumb: string | null;
    released: string | null;
    rating: number | null;
  };
  inCollection: boolean;
  children?: React.ReactNode;
}) {
  const year = vn.released?.slice(0, 4);
  const ratingDisplay = vn.rating != null ? (vn.rating / 10).toFixed(1) : null;
  return (
    <div
      className={`flex gap-3 rounded-lg border bg-bg-elev/40 p-2 transition-colors ${
        inCollection ? 'border-accent/40' : 'border-border'
      } hover:border-accent`}
    >
      <Link href={`/vn/${vn.id}`} className="block h-24 w-16 shrink-0 overflow-hidden rounded">
        <SafeImage src={vn.image_thumb || vn.image_url} alt={vn.title} className="h-full w-full" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/vn/${vn.id}`} className="line-clamp-2 text-xs font-bold transition-colors hover:text-accent">
          {vn.title}
        </Link>
        {vn.alttitle && vn.alttitle !== vn.title && (
          <div className="mt-0.5 line-clamp-1 text-[10px] text-muted">{vn.alttitle}</div>
        )}
        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
          {ratingDisplay && (
            <span className="inline-flex items-center gap-0.5 text-accent">
              <Star className="h-3 w-3 fill-accent" /> {ratingDisplay}
            </span>
          )}
          {year && <span>{year}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}
