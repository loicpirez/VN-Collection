import { NextRequest, NextResponse } from 'next/server';
import { EgsUnreachable, searchEgsCandidates } from '@/lib/erogamescape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
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
      const msg = {
        network: 'ErogameScape ne répond pas (problème réseau). Réessaie dans quelques minutes.',
        server: 'ErogameScape renvoie une erreur serveur. Réessaie dans quelques minutes.',
        throttled: 'Trop de requêtes vers ErogameScape — attends une minute avant de relancer.',
        blocked: 'ErogameScape refuse les requêtes (HTTP 403). Ton IP est peut-être bloquée.',
      }[e.kind];
      return NextResponse.json(
        { error: msg, kind: e.kind, status: e.status, candidates: [] },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
