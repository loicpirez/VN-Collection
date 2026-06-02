import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { ArrowLeft } from 'lucide-react';
import { toString as qrToString } from 'qrcode';
import { listCollectionForCards } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { qrOriginFromHeaders } from '@/lib/qr-origin';
import { isValidVnId, normalizeVnId } from '@/lib/vn-id-shape';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return { title: t.labels.title };
}
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

/**
 * Printable QR label sheet. Each label encodes the absolute URL of the
 * VN's detail page so a scan from a phone lands on the right entry.
 *
 * QRs are generated server-side as inline SVG via the `qrcode` package
 * - no external service. Earlier versions called api.qrserver.com,
 * which leaked the host URL (often a LAN hostname or LAN IP) plus
 * every VN ID to a third party for every label printed. Self-hosted
 * privacy posture demands local generation.
 */
const MAX_LABELS = 200;
const MAX_LABEL_FILTER_IDS = 500;

async function qrSvg(text: string, fallbackText: string): Promise<string> {
  try {
    return await qrToString(text, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch {
    const safe = fallbackText.replace(/[<>&"]/g, '').slice(0, 16);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><text x="2" y="14" font-size="6" fill="#cc0000">${safe}</text></svg>`;
  }
}

function parseIds(raw: string | undefined): Set<string> | 'invalid' | null {
  if (!raw) return null;
  const segments = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;
  for (const seg of segments) {
    if (!isValidVnId(seg)) return 'invalid';
  }
  return new Set(segments.slice(0, MAX_LABEL_FILTER_IDS).map(normalizeVnId));
}

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; status?: string }>;
}) {
  const { ids: idsRaw, status } = await searchParams;
  const parsedIds = parseIds(idsRaw);
  const t = await getDict();
  if (parsedIds === 'invalid') {
    return (
      <div className="w-full p-8 text-sm text-status-dropped">
        {t.labels.invalidIds}
      </div>
    );
  }
  const filter = parsedIds;
  // Derive the host from the incoming request so QR codes resolve back to
  // the same origin the user is browsing - works for any port or LAN IP.
  // Prefer x-forwarded-host (when behind a reverse proxy) before host
  // so the QRs encode the public hostname the user actually browses.
  const h = await headers();
  const origin = qrOriginFromHeaders({
    forwardedProto: h.get('x-forwarded-proto'),
    forwardedHost: h.get('x-forwarded-host'),
    host: h.get('host'),
  });
  // Push id filtering into SQL so we don't load the full library just
  // to drop most rows.
  const idList = filter ? Array.from(filter) : undefined;
  const allItems = listCollectionForCards({ sort: 'title', vnIds: idList }).filter(
    (it) => !status || it.status === status,
  );
  const truncated = allItems.length > MAX_LABELS;
  const items = truncated ? allItems.slice(0, MAX_LABELS) : allItems;

  // Pre-render every QR SVG server-side, so the printed sheet doesn't
  // depend on any third-party service.
  const qrs: string[] = new Array(items.length);
  {
    const QR_CONCURRENCY = 8;
    let cursor = 0;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < Math.min(QR_CONCURRENCY, items.length); w++) {
      workers.push(
        (async () => {
          while (true) {
            const idx = cursor++;
            if (idx >= items.length) return;
            qrs[idx] = await qrSvg(`${origin}/vn/${items[idx].id}`, t.labels.qrError);
          }
        })(),
      );
    }
    await Promise.all(workers);
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/data" className="inline-flex items-center gap-1 text-sm text-muted hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t.nav.data}
        </Link>
        <PrintButton label={t.labels.print} />
      </div>

      <h1 className="mb-4 text-2xl font-bold print:hidden">{t.labels.title}</h1>
      <p className="mb-6 text-sm text-muted print:hidden">{t.labels.hint}</p>

      {truncated && (
        <div className="mb-4 rounded-md border border-status-on_hold/40 bg-status-on_hold/10 px-4 py-2 text-sm text-status-on_hold print:hidden">
          {t.labels.truncated
            .replace('{shown}', String(MAX_LABELS))
            .replace('{total}', String(allItems.length))}
        </div>
      )}

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
              {/*
                PAGE-017: dangerouslySetInnerHTML safety note.
                The SVG string in `qrs[i]` is produced server-side by the
                `qrcode` npm package (toString with type:'svg'). It contains
                only SVG path/rect elements - no script, no event handler,
                no external resource reference. The source is entirely
                internal; no user-supplied string ever reaches this field.
                This pattern is reviewed on every `qrcode` dependency update.
              */}
              <div
                aria-label={t.labels.qrCodeFor.replace('{id}', it.id)}
                className="shrink-0 bg-white p-1 [&_svg]:h-20 [&_svg]:w-20"
                dangerouslySetInnerHTML={{ __html: qrs[i] }}
              />
              <div className="min-w-0">
                <p className="line-clamp-3 font-bold leading-tight" title={it.title}>{it.title}</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted">{it.id}</p>
                {(it.physical_location ?? []).length > 0 && (
                  <p className="mt-0.5 text-[10px] text-muted">{(it.physical_location ?? []).join(' / ')}</p>
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
