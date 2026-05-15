import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RawRow {
  banner_url: string | null;
  vn_id: string | null;
  surugaya_1: string | null;
  dmm: string | null;
  dlsite_id: string | null;
  gyutto_id: string | null;
}

export interface CoverCandidate {
  /** Stable identifier for the source. Used by the UI to set a preference. */
  source: 'banner' | 'vndb' | 'image_php' | 'surugaya' | 'dmm' | 'dlsite' | 'gyutto';
  /** Absolute URL the proxy will fetch on demand (or the local /api/files path). */
  url: string;
  /** Friendly label key resolved via t.coverPicker.egsSources[source]. */
  label: string;
}

const EGS_BASE = 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki';

/**
 * List EVERY candidate cover source EGS knows about for this game,
 * with no probing. The picker UI shows them side-by-side so the user
 * picks the prettiest one — instead of the resolver auto-falling-
 * back through them in priority order and locking the choice.
 *
 * Empty / malformed sources are filtered out, so a 4-source response
 * means 4 usable image URLs.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const egsId = Number(id);
  if (!Number.isInteger(egsId) || egsId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const row = db
    .prepare(
      'SELECT raw_json, vn_id FROM egs_game WHERE egs_id = ?',
    )
    .get(egsId) as { raw_json: string | null; vn_id: string | null } | undefined;

  let raw: RawRow = {
    banner_url: null,
    vn_id: null,
    surugaya_1: null,
    dmm: null,
    dlsite_id: null,
    gyutto_id: null,
  };
  if (row) {
    raw.vn_id = row.vn_id;
    if (row.raw_json) {
      try {
        const parsed = JSON.parse(row.raw_json) as Partial<RawRow>;
        raw = {
          ...raw,
          banner_url: parsed.banner_url ?? null,
          surugaya_1: parsed.surugaya_1 ?? null,
          dmm: parsed.dmm ?? null,
          dlsite_id: parsed.dlsite_id ?? null,
          gyutto_id: parsed.gyutto_id ?? null,
        };
      } catch {
        // raw_json corrupted; skip shop variants but still surface
        // the linked VN cover if there's one.
      }
    }
  }

  const out: CoverCandidate[] = [];

  if (raw.banner_url && /^https?:\/\//i.test(raw.banner_url.trim())) {
    out.push({ source: 'banner', url: raw.banner_url.trim(), label: 'EGS banner' });
  }

  if (raw.vn_id && /^v\d+$/i.test(raw.vn_id)) {
    const vn = db
      .prepare('SELECT image_url, local_image FROM vn WHERE id = ?')
      .get(raw.vn_id) as { image_url: string | null; local_image: string | null } | undefined;
    const cdn = vn?.local_image ? `/api/files/${vn.local_image}` : vn?.image_url ?? null;
    if (cdn) out.push({ source: 'vndb', url: cdn, label: `VNDB ${raw.vn_id}` });
  }

  // EGS's own image.php — usually exists but not always; the UI
  // will load it lazily and the <img onError> tells the user when
  // it 404s. No HEAD probe here to keep the candidates response
  // fast and stateless.
  out.push({
    source: 'image_php',
    url: `${EGS_BASE}/image.php?game=${egsId}`,
    label: 'EGS image.php',
  });

  const surugaya = (raw.surugaya_1 ?? '').trim();
  if (/^\d+$/.test(surugaya) && surugaya !== '0') {
    out.push({
      source: 'surugaya',
      url: `https://www.suruga-ya.jp/database/pics/game/${surugaya}.jpg`,
      label: 'Suruga-ya',
    });
  }

  const dmm = (raw.dmm ?? '').trim();
  if (/^[\w-]+$/.test(dmm)) {
    out.push({
      source: 'dmm',
      url: `https://pics.dmm.co.jp/digital/pcgame/${dmm}/${dmm}pl.jpg`,
      label: 'DMM',
    });
  }

  const dlsite = (raw.dlsite_id ?? '').trim().toUpperCase();
  if (/^[VR][JE]\d+$/.test(dlsite)) {
    const kind = dlsite.startsWith('R') ? 'doujin' : 'professional';
    out.push({
      source: 'dlsite',
      url: `https://img.dlsite.jp/modpub/images2/work/${kind}/${dlsite}/${dlsite}_img_main.jpg`,
      label: 'DLsite',
    });
  }

  const gyutto = (raw.gyutto_id ?? '').trim();
  if (/^\d+$/.test(gyutto)) {
    out.push({
      source: 'gyutto',
      url: `https://gyutto.com/i/item${gyutto}/package.jpg`,
      label: 'Gyutto',
    });
  }

  return NextResponse.json({ candidates: out });
}
