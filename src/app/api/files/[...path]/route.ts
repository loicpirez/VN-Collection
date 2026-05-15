import { NextResponse } from 'next/server';
import { readStored } from '@/lib/files';

export const dynamic = 'force-dynamic';

function safeAttachmentFilename(raw: string | undefined): string {
  if (!raw) return 'asset.svg';
  // Strip anything that could break out of the quoted filename and
  // inject a CR/LF header. Keep it to safe characters + dot/dash.
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
  return cleaned || 'asset.svg';
}

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
  const isSvg = file.contentType.includes('svg') || rel.toLowerCase().endsWith('.svg');
  const headers: Record<string, string> = {
    'Content-Type': isSvg ? 'application/octet-stream' : file.contentType,
    'Cache-Control': 'public, max-age=86400, immutable',
    // SVG path keeps `style-src 'unsafe-inline'` because in-SVG <style>
    // is sometimes the only way to render. For all other (raster) image
    // responses, neither scripts nor styles can ever execute, so we
    // tighten to `default-src 'none'`.
    'Content-Security-Policy': isSvg
      ? "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"
      : "default-src 'none'",
  };
  if (isSvg) {
    const filename = safeAttachmentFilename(rel.split('/').pop());
    headers['Content-Disposition'] = `attachment; filename="${filename}"`;
  }
  return new NextResponse(new Uint8Array(file.buffer), { status: 200, headers });
}
