import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { EgsUnreachable, searchEgsCandidates } from '@/lib/erogamescape';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Audit S-030: gate — every miss issues an EGS SQL POST.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Math.min(50, Math.max(1, Number(limitRaw) || 20)) : 20;
  if (!q) {
    return NextResponse.json({ candidates: [] });
  }
  try {
    const candidates = await searchEgsCandidates(q, limit);
    return NextResponse.json({ candidates });
  } catch (e) {
    if (e instanceof EgsUnreachable) {
      // Audit I-016 follow-up: return a STABLE machine-readable kind so
      // the client can localize the message itself. The previous FR-only
      // copy never reached EN/JA users — and EN code-string comparisons
      // (`/steam_not_configured/`) couldn't pattern-match into French.
      return NextResponse.json(
        { error: 'egs_unreachable', kind: e.kind, status: e.status, candidates: [] },
        { status: 503 },
      );
    }
    return upstreamError('egs/search', e);
  }
}
