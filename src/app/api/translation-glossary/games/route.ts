import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { apiErrorBody } from '@/lib/api-error-shape';
import { parseOptionalQueryInteger } from '@/lib/query-params';
import { getCollectionListRepository } from '@/lib/db/repositories/collection-list';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_PAGE_SIZE = 240;
const MAX_PAGE_SIZE = 500;
const MAX_PAGE = 20_000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const parsedPage = parseOptionalQueryInteger(req.nextUrl.searchParams.get('page'), {
    minimum: 1,
    maximum: MAX_PAGE,
  });
  const parsedLimit = parseOptionalQueryInteger(req.nextUrl.searchParams.get('limit'), {
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  });
  const page = parsedPage ?? 1;
  const pageSize = parsedLimit ?? DEFAULT_PAGE_SIZE;
  if (parsedPage === null || parsedLimit === null) {
    return NextResponse.json({ error: 'invalid pagination' }, { status: 400 });
  }
  try {
    const rows = await getCollectionListRepository().listCards({
      sort: 'title',
      order: 'asc',
      limit: pageSize + 1,
      offset: (page - 1) * pageSize,
    });
    const hasMore = rows.length > pageSize;
    const games = rows.slice(0, pageSize).map((row) => ({
      id: row.id.toLowerCase(),
      title: row.title,
      alttitle: row.alttitle,
    }));
    return NextResponse.json({
      version: 1,
      games,
      pagination: {
        page,
        page_size: pageSize,
        returned: games.length,
        has_more: hasMore,
      },
    });
  } catch {
    return NextResponse.json(
      apiErrorBody('internal error', 'translation_glossary_games_unavailable', 'translation-glossary/games'),
      { status: 500 },
    );
  }
}
