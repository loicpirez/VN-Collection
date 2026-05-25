import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { providerFetch } from '@/lib/proxy-fetch';
import { resolveProxyConfig, type ProviderId } from '@/lib/proxy-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROVIDER_TEST_URLS: Record<ProviderId, string> = {
  vndb: 'https://api.vndb.org/kana/schema',
  vndbmirror: 'https://api.yorhel.org/kana/schema',
  egs: 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/sql_for_erogamer_form.php',
  alice_kobe: 'https://www.alice-kobe.com/html/page4.html',
};

const VALID_PROVIDERS = new Set<string>(['vndb', 'vndbmirror', 'egs', 'alice_kobe']);

export async function POST(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const { provider } = body;

  if (typeof provider !== 'string' || !VALID_PROVIDERS.has(provider)) {
    return NextResponse.json(
      { error: 'provider must be one of: vndb, vndbmirror, egs, alice_kobe' },
      { status: 400 },
    );
  }

  const providerId = provider as ProviderId;
  const config = resolveProxyConfig(providerId);
  if (!config) {
    return NextResponse.json(
      { error: 'proxy is not configured or disabled for this provider' },
      { status: 400 },
    );
  }

  const testUrl = PROVIDER_TEST_URLS[providerId];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  const start = Date.now();

  try {
    const res = await providerFetch(
      testUrl,
      {
        method: 'GET',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'vndb-collection/1.0 (proxy test)' },
      },
      providerId,
    );
    const latencyMs = Date.now() - start;
    if (res.status >= 500) {
      return NextResponse.json(
        { ok: false, error: `remote returned HTTP ${res.status}`, latencyMs },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true, latencyMs, status: res.status });
  } catch (e) {
    const latencyMs = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, latencyMs }, { status: 200 });
  } finally {
    clearTimeout(timer);
  }
}
