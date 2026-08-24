import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

describe('PostgreSQL production deployment contract', () => {
  it('uses a pinned multi-stage non-root image with a bounded liveness check', () => {
    const dockerfile = read('Dockerfile');
    expect(dockerfile).toContain('node:24.14.1-bookworm-slim@sha256:');
    expect(dockerfile).toContain(' AS dependencies');
    expect(dockerfile).toContain(' AS builder');
    expect(dockerfile).toContain(' AS runner');
    expect(dockerfile).toContain('python3 make g++');
    expect(dockerfile).toContain('USER 10001:10001');
    expect(dockerfile).toContain('VOLUME ["/app/data"]');
    expect(dockerfile).toContain('/api/health?check=live');
    expect(dockerfile).not.toContain('db:postgres:apply');
  });

  it('excludes secrets, databases, local data, dependencies, and build artifacts', () => {
    const ignored = read('.dockerignore').split(/\r?\n/);
    for (const entry of [
      '.env', '.env.*', 'data', '*.db', '*.db-wal', '*.db-shm', 'node_modules', '.next',
      '.audit-tmp', '.qa', '.tmp', 'logs', '*.zip',
    ]) {
      expect(ignored).toContain(entry);
    }
  });

  it('builds a Next standalone server and documents dual health semantics', () => {
    expect(read('next.config.mjs')).toContain("output: 'standalone'");
    const operations = read('docs/POSTGRESQL_OPERATIONS.md');
    expect(operations).toContain('GET /api/health?check=live');
    expect(operations).toContain('GET /api/health?check=ready');
    expect(operations).toContain('UID/GID 10001');
    expect(operations).toContain('pg_restore --list');
  });

  it('runs real PostgreSQL integration tests with pinned CI dependencies', () => {
    const workflow = read('.github/workflows/postgres-integration.yml');
    expect(workflow).toContain('postgres:16.10-bookworm@sha256:');
    expect(workflow).toMatch(/actions\/checkout@[a-f0-9]{40}/);
    expect(workflow).toMatch(/actions\/setup-node@[a-f0-9]{40}/);
    expect(workflow).not.toMatch(/uses: actions\/(?:checkout|setup-node)@v\d/);
    expect(workflow).toContain('yarn test:postgres:run');
    const integration = read('tests/postgres-integration/runtime.pgtest.ts');
    expect(integration).not.toMatch(/\b(?:describe|it|test)\.(?:skip|skipIf|only)\s*\(/);
  });

  it('versions the hardened systemd service and treats deliberate shutdown as successful', () => {
    const service = read('ops/systemd/vndb.service');
    expect(service).toContain('EnvironmentFile=/etc/vndb/vndb.env');
    expect(service).toContain('Environment=HOSTNAME=127.0.0.1');
    expect(service).toContain('ExecStart=/usr/bin/node /var/www/vndb-current/.next/standalone/server.js');
    expect(service).toContain('Restart=on-failure');
    expect(service).toContain('KillSignal=SIGTERM');
    expect(service).toContain('SuccessExitStatus=143');
    expect(service).toContain('CapabilityBoundingSet=\n');
    expect(service).toContain('NoNewPrivileges=true');
    expect(service).toContain('ProtectSystem=full');
    expect(service).toContain('ProtectHome=true');
    expect(service).toContain('ReadOnlyPaths=/var/www/vndb-releases');
    expect(service).toContain('ReadWritePaths=/var/www/vndb/data');
    expect(service).not.toContain('DATABASE_URL=');
  });
});
