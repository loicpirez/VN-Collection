import { NextResponse } from 'next/server';
import { readDatabaseConfig, type DatabaseBackend } from '@/lib/db/postgres-config';
import { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';

export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

interface LiveHealthBody {
  status: 'ok';
  check: 'live';
}

interface ReadyHealthBody {
  status: 'ok';
  check: 'ready';
  backend: DatabaseBackend;
  database: 'available';
  pool?: { max: number; total: number; idle: number; waiting: number };
}

interface FailedHealthBody {
  status: 'unavailable' | 'error';
  check: 'ready' | 'invalid';
  backend?: DatabaseBackend;
  code: 'database_unavailable' | 'invalid_health_check';
}

/**
 * Report process liveness or database-backed readiness without exposing
 * connection strings, SQL, relation names, constraints, or driver messages.
 *
 * @param request Health request with optional `check=live|ready` query.
 * @returns Minimal liveness/readiness JSON and an appropriate HTTP status.
 */
export async function GET(request: Request): Promise<NextResponse<LiveHealthBody | ReadyHealthBody | FailedHealthBody>> {
  const check = new URL(request.url).searchParams.get('check') ?? 'ready';
  if (check === 'live') return NextResponse.json({ status: 'ok', check: 'live' });
  if (check !== 'ready') {
    return NextResponse.json(
      { status: 'error', check: 'invalid', code: 'invalid_health_check' },
      { status: 400 },
    );
  }
  let backend: DatabaseBackend | undefined;
  try {
    const config = readDatabaseConfig();
    backend = config.backend;
    if (backend === 'postgres') {
      const { getPostgresPoolStatus, postgresQuery } = await import('@/lib/db/postgres');
      await postgresQuery('SELECT 1 AS ready');
      return NextResponse.json({
        status: 'ok',
        check: 'ready',
        backend,
        database: 'available',
        pool: getPostgresPoolStatus(),
      });
    }
    const { db } = await import('@/lib/db');
    db.prepare('SELECT 1 AS ready').get();
    return NextResponse.json({ status: 'ok', check: 'ready', backend, database: 'available' });
  } catch {
    return NextResponse.json(
      { status: 'unavailable', check: 'ready', ...(backend ? { backend } : {}), code: 'database_unavailable' },
      { status: 503 },
    );
  }
}
