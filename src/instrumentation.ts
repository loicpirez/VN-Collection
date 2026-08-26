import { readDatabaseConfig } from '@/lib/db/postgres-config';

/**
 * Validate PostgreSQL migration state during the Next.js Node bootstrap.
 * Schema application remains an explicit operator action.
 *
 * @returns Nothing after the selected backend is ready for application work.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { installServerShutdownHooks } = await import('@/lib/server-shutdown');
  installServerShutdownHooks();
  const config = readDatabaseConfig();
  if (config.backend !== 'postgres') return;
  const { assertPostgresRuntimeReady, installPostgresShutdownHooks } = await import('@/lib/db/postgres');
  installPostgresShutdownHooks();
  await assertPostgresRuntimeReady();
}
