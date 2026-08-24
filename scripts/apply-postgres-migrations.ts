import { applyPostgresMigrations } from '../src/lib/db/migrate';
import { closePostgresPool, getPostgresPool } from '../src/lib/db/postgres';
import { readDatabaseConfig } from '../src/lib/db/postgres-config';

async function main(): Promise<void> {
  const config = readDatabaseConfig();
  if (config.backend !== 'postgres') {
    throw new Error('db:postgres:apply requires DATABASE_BACKEND=postgres');
  }
  try {
    const result = await applyPostgresMigrations(getPostgresPool());
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closePostgresPool();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
