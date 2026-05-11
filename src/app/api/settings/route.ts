import { NextRequest, NextResponse } from 'next/server';
import { getAppSetting, setAppSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SAFE_KEYS = new Set([
  'vndb_token',
  'random_quote_source',
]);

function maskToken(value: string | null): { hasToken: boolean; preview: string | null; envFallback: boolean } {
  const envFallback = !!process.env.VNDB_TOKEN;
  if (!value) return { hasToken: envFallback, preview: null, envFallback };
  const tail = value.slice(-4);
  return { hasToken: true, preview: `…${tail}`, envFallback };
}

export async function GET() {
  const tokenRow = getAppSetting('vndb_token');
  return NextResponse.json({
    vndb_token: maskToken(tokenRow),
    random_quote_source: getAppSetting('random_quote_source') ?? 'all',
  });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!SAFE_KEYS.has(key)) {
      return NextResponse.json({ error: `unknown setting: ${key}` }, { status: 400 });
    }
  }
  if ('vndb_token' in body) {
    const v = body.vndb_token;
    if (v == null || v === '') {
      setAppSetting('vndb_token', null);
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      // VNDB tokens are alphanumeric (usually starts with "vndb-"). 200 chars is plenty.
      if (trimmed.length > 200 || /[\s"]/.test(trimmed)) {
        return NextResponse.json({ error: 'invalid token format' }, { status: 400 });
      }
      setAppSetting('vndb_token', trimmed || null);
    } else {
      return NextResponse.json({ error: 'vndb_token must be a string' }, { status: 400 });
    }
  }
  if ('random_quote_source' in body) {
    const v = body.random_quote_source;
    if (v !== 'all' && v !== 'mine') {
      return NextResponse.json({ error: 'random_quote_source must be all|mine' }, { status: 400 });
    }
    setAppSetting('random_quote_source', v);
  }
  return NextResponse.json({ ok: true });
}
