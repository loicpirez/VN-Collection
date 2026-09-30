import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const temporaryDirectories: string[] = [];
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

const makeTemporaryDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'vndb-production-operations-'));
  temporaryDirectories.push(directory);
  return directory;
};

const writeExecutable = (path: string, body: string): void => {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('production operations', () => {
  it('adds the proven staff identity as an idempotent transactional primary key', () => {
    const migration = read('db/postgres/migrations/0013_vn_staff_credit_primary_key.sql');
    const sqliteSchema = read('src/lib/db.ts');

    expect(migration.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(migration).toContain("conrelid = 'vn_staff_credit'::regclass");
    expect(migration).toContain("contype = 'p'");
    expect(migration).toContain('GROUP BY vn_id, sid, role');
    expect(migration).toContain('PRIMARY KEY USING INDEX idx_vn_staff_credit_unique');
    expect(migration).not.toContain('ALTER TABLE vn_va_credit');
    expect(sqliteSchema).toContain('ON vn_staff_credit(vn_id, sid, role)');
    expect(sqliteSchema).toContain(
      "ON vn_va_credit(vn_id, c_id, sid, COALESCE(aid, -1), COALESCE(note, ''), COALESCE(va_lang, ''))",
    );
  });

  it('runs every operational shell asset through the shell parser', () => {
    const scripts = [
      'ops/backup/vndb-rclone-common.sh',
      'ops/backup/vndb-offsite-replicate',
      'ops/backup/vndb-offsite-restore-drill',
      'ops/maintenance/vndb-cache-prune',
      'ops/nginx/enable-http2.sh',
    ];

    const result = spawnSync('/bin/bash', ['-n', ...scripts.map((script) => join(root, script))], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('accepts only a locked crypt remote and validates checksum sidecars', () => {
    const workspace = makeTemporaryDirectory();
    const bin = join(workspace, 'bin');
    const config = join(workspace, 'rclone.conf');
    const data = join(workspace, 'backup.dump');
    const sidecar = `${data}.sha256`;
    mkdirSync(bin);
    writeFileSync(config, '[vndb-offsite]\ntype = crypt\n');
    chmodSync(config, 0o600);
    writeFileSync(data, 'verified backup\n');
    writeFileSync(sidecar, 'f947a1d705206c805b3e1a4e9d0210f17c6825d0a824244e6328ff6be182c2e6  ignored\n');
    writeExecutable(
      join(bin, 'rclone'),
      '#!/usr/bin/env bash\nprintf "[vndb-offsite]\\ntype = %s\\n" "${RCLONE_TEST_TYPE:-crypt}"\n',
    );

    const command = [
      `. "${join(root, 'ops/backup/vndb-rclone-common.sh')}"`,
      `vndb_require_rclone_crypt "${config}" 'vndb-offsite:vndb-production'`,
      `vndb_verify_checksum_sidecar "${sidecar}" "${data}"`,
    ].join('\n');
    const accepted = spawnSync('/bin/bash', ['-c', command], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
    });
    const rejected = spawnSync('/bin/bash', ['-c', command], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, RCLONE_TEST_TYPE: 'drive' },
    });

    expect(accepted.status).toBe(0);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('Refusing a non-crypt off-site destination');
  });

  it('executes one bounded cache batch and emits before and after metrics', () => {
    const workspace = makeTemporaryDirectory();
    const bin = join(workspace, 'bin');
    mkdirSync(bin);
    writeExecutable(
      join(bin, 'psql'),
      [
        '#!/usr/bin/env bash',
        'query="$(cat)"',
        'if [[ "$query" == *"DELETE FROM vndb_cache"* ]]; then',
        "  printf '5000\\t10485760\\n'",
        'elif [[ "$query" == *"pg_total_relation_size"* ]]; then',
        "  printf '63532\\t314572800\\t393216000\\t4606\\n'",
        'else',
        "  printf '58532\\t304087040\\t9606\\n'",
        'fi',
      ].join('\n'),
    );

    const result = spawnSync('/bin/bash', [join(root, 'ops/maintenance/vndb-cache-prune')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        DATABASE_URL: 'postgresql://test.invalid/database',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('retention_days=30 batch_size=5000');
    expect(result.stdout).toContain('before_rows=63532');
    expect(result.stdout).toContain('deleted_rows=5000 deleted_body_bytes=10485760');
    expect(result.stdout).toContain('after_rows=58532');
  });

  it('versions hardened schedules, restore validation, and guarded HTTP/2 activation', () => {
    const replication = read('ops/backup/vndb-offsite-replicate');
    const restore = read('ops/backup/vndb-offsite-restore-drill');
    const cache = read('ops/maintenance/vndb-cache-prune');
    const http2 = read('ops/nginx/enable-http2.sh');
    const replicationService = read('ops/systemd/vndb-offsite-replicate.service');
    const restoreService = read('ops/systemd/vndb-offsite-restore-drill.service');
    const cacheService = read('ops/systemd/vndb-cache-prune.service');

    expect(replication).toContain('--immutable');
    expect(replication).toContain('rclone check');
    expect(replication).toContain('VNDB_OFFSITE_RETENTION_DAYS:-95');
    expect(restore).toContain('pg_restore --list');
    expect(restore).toContain('--exit-on-error');
    expect(restore).toContain('COUNT(*) FROM pg_index WHERE NOT indisvalid');
    expect(restore).toContain('tar -xzf');
    expect(cache).toContain('LIMIT :\'batch_size\'::BIGINT');
    expect(cache).toContain('FOR UPDATE SKIP LOCKED');
    expect(replicationService).toContain('ProtectSystem=strict');
    expect(restoreService).toContain('ReadWritePaths=/var/tmp /var/lib/postgresql /var/run/postgresql');
    expect(cacheService).toContain('EnvironmentFile=/etc/vndb/vndb.env');
    expect(http2).toContain('listen[[:space:]]\\+443');
    expect(http2).toContain('nginx -t');
    expect(http2).toContain("negotiated_protocol");
    expect(http2).toContain('cp --preserve=mode,ownership,timestamps "$backup" "$site"');
  });
});
