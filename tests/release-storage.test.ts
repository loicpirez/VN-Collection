import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const helpers = join(root, 'ops', 'release-storage.sh');
const temporaryDirectories: string[] = [];

const makeTemporaryDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'vndb-release-storage-'));
  temporaryDirectories.push(directory);
  return directory;
};

const runHelpers = (body: string, args: string[] = []): SpawnSyncReturns<string> =>
  spawnSync(
    '/bin/bash',
    ['-c', `. "$1"\nshift\n${body}`, 'release-storage-test', helpers, ...args],
    { encoding: 'utf8' },
  );

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release storage deployment safeguards', () => {
  it('accepts only real direct children named with a full lowercase commit SHA', () => {
    const workspace = makeTemporaryDirectory();
    const store = join(workspace, 'releases');
    const outside = join(workspace, 'outside');
    const valid = join(store, 'a'.repeat(40));
    const invalidName = join(store, 'not-a-release');
    const linked = join(store, 'b'.repeat(40));
    const nested = join(valid, 'c'.repeat(40));
    mkdirSync(store);
    mkdirSync(outside);
    mkdirSync(valid);
    mkdirSync(invalidName);
    mkdirSync(nested);
    symlinkSync(outside, linked);

    const result = runHelpers(
      [
        'release_storage_is_release_directory "$1" "$2"; printf "%s\\n" "$?"',
        'release_storage_is_release_directory "$1" "$3"; printf "%s\\n" "$?"',
        'release_storage_is_release_directory "$1" "$4"; printf "%s\\n" "$?"',
        'release_storage_is_release_directory "$1" "$5"; printf "%s\\n" "$?"',
      ].join('\n'),
      [store, valid, invalidName, linked, nested],
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim().split('\n')).toEqual(['0', '1', '1', '1']);
  });

  it('rejects exhausted byte and inode reserves', () => {
    const result = runHelpers(
      [
        'release_storage_assert_capacity_values 100 50 100 50; printf "enough=%s\\n" "$?"',
        'release_storage_assert_capacity_values 99 50 100 50; printf "bytes=%s\\n" "$?"',
        'release_storage_assert_capacity_values 100 49 100 50; printf "inodes=%s\\n" "$?"',
        'release_storage_assert_capacity_values invalid 50 100 50; printf "invalid=%s\\n" "$?"',
      ].join('\n'),
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim().split('\n')).toEqual([
      'enough=0',
      'bytes=1',
      'inodes=1',
      'invalid=1',
    ]);
    expect(result.stderr).toContain('release filesystem has 99 bytes free');
    expect(result.stderr).toContain('release filesystem has 49 inodes free');
  });

  it('keeps protected targets and the configured number of recent releases', () => {
    const workspace = makeTemporaryDirectory();
    const store = join(workspace, 'releases');
    mkdirSync(store);
    const releases = Array.from({ length: 7 }, (_, index) =>
      join(store, (index + 1).toString(16).padStart(40, '0')),
    );
    for (const [index, release] of releases.entries()) {
      mkdirSync(release);
      const timestamp = new Date((index + 1) * 10_000);
      utimesSync(release, timestamp, timestamp);
    }
    mkdirSync(join(store, 'unrecognized'));
    symlinkSync(join(workspace, 'outside'), join(store, 'f'.repeat(40)));

    const result = runHelpers(
      'release_storage_list_prunable "$1" 2 "$2" "$3"',
      [store, releases[0], releases[6]],
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim().split('\n').map((path) => basename(path))).toEqual([
      basename(releases[3]),
      basename(releases[2]),
      basename(releases[1]),
    ]);
    expect(result.stderr).toContain('Skipping unrecognized release-store entry');
  });

  it('runs capacity checks before building and prunes only after activation succeeds', () => {
    const deploy = readFileSync(join(root, 'ops', 'deploy-release.sh'), 'utf8');

    expect(deploy).toContain('VN_DEPLOY_RELEASE_RETENTION:-3');
    expect(deploy).toContain('VN_DEPLOY_MIN_FREE_BYTES:-10737418240');
    expect(deploy).toContain('VN_DEPLOY_MIN_FREE_INODES:-250000');
    expect(deploy.indexOf('release_storage_preflight')).toBeLessThan(deploy.indexOf('git clone'));
    expect(deploy.indexOf('systemctl is-active "$service_name"')).toBeLessThan(
      deploy.indexOf('prune_old_releases "$active_target" "$old_target" "$release_dir"'),
    );
    expect(deploy).toContain('release_storage_is_release_directory "$release_store" "$candidate"');
    expect(deploy).toContain(
      'release_storage_is_protected "$candidate" "$active_release" "$rollback_release" "$new_release"',
    );
    expect(deploy).toContain('sudo rm -rf --one-file-system -- "$candidate"');
  });
});
