import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { internalError } from '@/lib/api-error';
import { createRawCacheExport } from '@/lib/db/raw-cache-export';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Stream the complete VNDB response cache as a valid JSON document. */
export async function GET(req: Request): Promise<Response> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const download = await createRawCacheExport();
    return new Response(download.stream, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${download.filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return internalError('export.raw.GET', error);
  }
}
