import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { createRequestDeadline } from '@/lib/request-deadline';
import { isValidVnId } from '@/lib/vn-id-shape';
import { getCharactersForVn } from '@/lib/vndb';
import { buildTranslationGlossary } from '@/lib/translation-glossary';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const id = rawId.toLowerCase();
  if (!isValidVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const deadline = createRequestDeadline(req.signal);
  try {
    const characters = await getCharactersForVn(id, 100, deadline.signal);
    return NextResponse.json(buildTranslationGlossary(id, characters));
  } catch (error) {
    return upstreamError('translation-glossary/[id]', error);
  } finally {
    deadline.dispose();
  }
}
