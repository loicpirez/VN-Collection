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
  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
