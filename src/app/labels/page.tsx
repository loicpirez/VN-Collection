import Link from 'next/link';
import { headers } from 'next/headers';
import { ArrowLeft } from 'lucide-react';
import { toString as qrToString } from 'qrcode';
import { listCollection } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

/**
 * Printable QR label sheet. Each label encodes the absolute URL of the
 * VN's detail page so a scan from a phone lands on the right entry.
 *
 * QRs are generated server-side as inline SVG via the `qrcode` package
 * — no external service. Earlier versions called api.qrserver.com,
 * which leaked the host URL (often a LAN hostname or LAN IP) plus
 * every VN ID to a third party for every label printed. Self-hosted
 * privacy posture demands local generation.
 */
async function qrSvg(text: string): Promise<string> {
  return qrToString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });
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
  // Prefer x-forwarded-host (when behind a reverse proxy) before host
  // so the QRs encode the public hostname the user actually browses.
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;
  // Push id filtering into SQL so we don't load the full library just
  // to drop most rows.
  const idList = filter ? Array.from(filter) : undefined;
  const items = listCollection({ sort: 'title', vnIds: idList }).filter(
    (it) => !status || it.status === status,
  );

  // Pre-render every QR SVG server-side, so the printed sheet doesn't
  // depend on any third-party service.
  const qrs = await Promise.all(items.map((it) => qrSvg(`${origin}/vn/${it.id}`)));

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

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg-card p-10 text-center text-sm text-muted print:hidden">
          {t.labels.empty}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-4 print:gap-1">
          {items.map((it, i) => (
            <div
              key={it.id}
              className="flex items-center gap-2 rounded-md border border-border bg-bg-card p-2 text-[11px] print:border-black/40"
            >
              {/* QR rendered as inline SVG — no network request, no
                  third-party data leak, prints sharply at any size. */}
              <div
                aria-label={`QR ${it.id}`}
                className="shrink-0 bg-white p-1 [&_svg]:h-20 [&_svg]:w-20"
                dangerouslySetInnerHTML={{ __html: qrs[i] }}
              />
              <div className="min-w-0">
                <p className="line-clamp-3 font-bold leading-tight">{it.title}</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted">{it.id}</p>
                {(it.physical_location ?? []).length > 0 && (
                  <p className="mt-0.5 text-[10px] text-muted">{(it.physical_location ?? []).join(' · ')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @media print {
          @page { margin: 8mm; }
          body { background: white !important; color: black !important; }
        }
      `}</style>
    </div>
  );
}
