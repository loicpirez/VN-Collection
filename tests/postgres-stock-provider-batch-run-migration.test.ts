import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../db/postgres/migrations/0011_stock_provider_batch_runs.sql', import.meta.url),
  'utf8',
);

describe('PostgreSQL stock provider batch-run migration', () => {
  it('creates one bounded row per provider with ordered timestamps', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS stock_provider_batch_run');
    expect(migration).toContain('provider    TEXT PRIMARY KEY');
    expect(migration).toContain('CHECK (finished_at >= started_at)');
    expect(migration).not.toContain('stock_batch_job');
  });
});
