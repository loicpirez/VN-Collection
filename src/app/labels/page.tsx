import Link from 'next/link';
import { headers } from 'next/headers';
import { ArrowLeft } from 'lucide-react';
import { listCollection } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

/**
 * Printable QR label sheet. Each label encodes the absolute URL of the
 * VN's detail page so a scan from a phone lands on the right entry.
 *
 * The QR rendering uses the public api.qrserver.com endpoint (no extra
 * dependency, no token). Image lazy-loads so a sheet of 100 labels
 * doesn't blow the network budget.
 */
function qrUrl(text: string, size = 96): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
}

function parseIds(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; status?: string }>;
}) {
  const { ids: idsRaw, status } = await searchParams;
  const filter = parseIds(idsRaw);
  const t = await getDict();
  // Derive the host from the incoming request so QR codes resolve back to
  // the same origin the user is browsing — works for any port or LAN IP.
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;
  const all = listCollection({ sort: 'title' });
  const items = all.filter((it) => (filter == null || filter.has(it.id)) && (!status || it.status === status));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/data" className="inline-flex items-center gap-1 text-sm text-muted hover:text-white">
          <ArrowLeft className="h-4 w-4" /> {t.nav.data}
        </Link>
        <PrintButton label={t.labels.print} />
      </div>

      <h1 className="mb-4 text-2xl font-bold print:hidden">{t.labels.title}</h1>
      <p className="mb-6 text-sm text-muted print:hidden">{t.labels.hint}</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-4 print:gap-1">
        {items.map((it) => {
          const url = `${origin}/vn/${it.id}`;
          return (
            <div
              key={it.id}
              className="flex items-center gap-2 rounded-md border border-border bg-bg-card p-2 text-[10px] print:border-black/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl(url, 80)}
                width={80}
                height={80}
                alt={`QR ${it.id}`}
                loading="lazy"
                className="shrink-0 bg-white"
              />
              <div className="min-w-0">
                <p className="line-clamp-3 font-bold leading-tight">{it.title}</p>
                <p className="mt-0.5 font-mono text-[9px] text-muted">{it.id}</p>
                {(it.physical_location ?? []).length > 0 && (
                  <p className="mt-0.5 text-[9px] text-muted">{(it.physical_location ?? []).join(' · ')}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @media print {
          @page { margin: 8mm; }
          body { background: white !important; color: black !important; }
        }
      `}</style>
    </div>
  );
}
