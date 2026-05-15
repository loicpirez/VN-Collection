import { NextResponse } from 'next/server';
import { readStored } from '@/lib/files';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const rel = path.join('/');
  if (rel.includes('..')) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }
  const file = await readStored(rel);
  if (!file) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // SVGs CAN carry inline <script>; serving them with image/svg+xml
  // inline means the script runs in OUR origin. Force `attachment`
  // disposition + a neutral content-type so any future user-uploaded
  // (or imported) SVG asset is downloaded rather than rendered.
  // The image magic-byte sniffer already rejects SVG uploads, but
  // a stale .svg lingering from older versions or a future API path
  // shouldn't become an XSS gadget either.
  const isSvg = file.contentType.includes('svg') || rel.toLowerCase().endsWith('.svg');
  const headers: Record<string, string> = {
    'Content-Type': isSvg ? 'application/octet-stream' : file.contentType,
    'Cache-Control': 'public, max-age=86400, immutable',
    // Defence in depth — even with a misconfigured Content-Type,
    // inline scripts can't reach into the app origin's globals.
    'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
  };
  if (isSvg) {
    headers['Content-Disposition'] = `attachment; filename="${rel.split('/').pop() ?? 'asset.svg'}"`;
  }
  return new NextResponse(new Uint8Array(file.buffer), { status: 200, headers });
}
