import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getPeopleRepository } from '@/lib/db/repositories/people';
import { getAppSettingRepository } from '@/lib/db/repositories/app-setting';
import { getQuoteRepository } from '@/lib/db/repositories/quote';
import { getVnReadRepository } from '@/lib/db/repositories/vn-read';
import { getRandomQuote } from '@/lib/vndb';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { tooManyRequests } from '@/lib/rate-limit-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const limited = tooManyRequests(req, 'vndb/quote/random', { limit: 30, windowMs: 10_000 });
  if (limited) return limited;
  try {
    const source = await getAppSettingRepository().get('random_quote_source') ?? 'all';
    if (source === 'mine') {
      // 100% local: pull from the vn_quote table populated by ensureLocalImagesForVn
      // (no VNDB call). Falls back to global random only when the table is empty
      // (e.g. brand-new install with no synced VNs).
      const row = await getQuoteRepository().randomLocal();
      if (row) {
        return NextResponse.json({
          quote: {
            id: row.quote_id,
            quote: row.quote,
            score: row.score,
            vn: {
              id: row.vn_id,
              title: row.vn_title,
              image_url: row.vn_image_url,
              local_image: row.vn_local_image,
              local_image_thumb: row.vn_local_image_thumb,
            },
            character: row.character_id
              ? {
                  id: row.character_id,
                  name: row.character_name ?? '',
                  original: null,
                  // Surface the locally-mirrored portrait so the
                  // QuoteFooter can render the avatar without
                  // a follow-up fetch.
                  image: row.character_local_image
                    ? { local_path: row.character_local_image }
                    : null,
                }
              : null,
          },
          source: 'mine' as const,
        });
      }
    }
    const quote = await getRandomQuote();
    // Enrich the VNDB-sourced random quote with our local mirror of
    // the character portrait + a richer VN cover row, so the
    // QuoteAvatar fallback chain (character → vn cover → icon) has
    // every column it needs. Mutating a shallow copy keeps the
    // response shape decoupled from the cache layer.
    if (quote) {
      const vnId = quote.vn?.id ?? null;
      const vnCover = vnId
        ? (await getVnReadRepository().getCovers([vnId]))[0] ?? null
        : null;
      const charImg = quote.character?.id
        ? await getPeopleRepository().characterImage(quote.character.id)
        : null;
      return NextResponse.json({
        quote: {
          ...quote,
	          vn: vnCover
	            ? {
	                ...quote.vn,
	                image_url: vnCover.image_url,
	                local_image: vnCover.local_image,
	                local_image_thumb: vnCover.local_image_thumb,
              }
            : quote.vn,
          character:
            quote.character && charImg?.local_path
              ? {
                  ...quote.character,
                  image: { local_path: charImg.local_path },
                }
              : quote.character,
        },
        source: 'all' as const,
      });
    }
    return NextResponse.json({ quote, source: 'all' as const });
  } catch (err) {
    return upstreamError('vndb/quote/random', err);
  }
}
