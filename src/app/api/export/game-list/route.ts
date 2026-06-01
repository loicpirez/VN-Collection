import { NextResponse } from 'next/server';
import { listCollection } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { internalError } from '@/lib/api-error';
import { buildArchiveName, compareArchiveSource, type ArchiveNameSource } from '@/lib/archive-name';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Plain-text archive listing: one line per game across the WHOLE
 * collection, formatted `<Brand> - <Title> (<Year>)` and ordered by brand
 * then title (see {@link buildArchiveName}). Mirrors how the user names the
 * physical dump folders. Gated behind localhost / admin token like the
 * other exports since it walks the entire private library.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const items = listCollection({ sort: 'title' });
    const lines = items
      .map(
        (it): ArchiveNameSource => ({
          title: it.title,
          alttitle: it.alttitle ?? null,
          released: it.released ?? null,
          developers: it.developers ?? [],
          publishers: it.publishers ?? [],
        }),
      )
      .sort(compareArchiveSource)
      .map(buildArchiveName);
    const today = new Date().toISOString().slice(0, 10);
    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="vn-games-${today}.txt"`,
      },
    });
  } catch (err) {
    return internalError('export.game-list.GET', err);
  }
}
