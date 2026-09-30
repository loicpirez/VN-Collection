# Encrypted off-site backups and restore drills

## Production evidence from 2026-10-01

The production host creates verified custom-format PostgreSQL dumps every day and verified storage archives every week under `/var/backups/vndb`. Both directories are on the root filesystem, so those copies do not survive loss of the host or its storage.

Rclone 1.74.2 is installed. Its existing user configuration defines Google Drive, iCloud Drive, and Proton Drive remotes. A metadata-only connectivity check reached Google Drive and reported 656,436,549,009 free bytes; iCloud Drive and Proton Drive returned errors. No crypt remote, off-site backup unit, or off-site restore unit exists. The existing rclone configuration is mode `0664`, which is too permissive for unattended backup credentials and must not be used by the services in this repository.

The repo-managed design uses a root-owned rclone `crypt` remote backed by the reachable Google Drive remote. Rclone encrypts file contents, file names, and directory names before upload. The replication job rejects any destination whose configured type is not `crypt`, rejects group-readable or world-readable configuration, validates every local SHA-256 sidecar, uploads immutable files, checks the remote, then removes remote backup pairs older than 95 days. It includes only the regular PostgreSQL and storage backup directories. Historical cutover artifacts and configuration snapshots are excluded.

## One-time production installation

Run these commands from a reviewed release checkout. They are intentionally not part of application deployment because they install root services and reuse an operator-owned cloud destination.

```bash
sudo install -d -o root -g root -m 0700 /etc/vndb
sudo install -o root -g root -m 0600 \
  /home/ubuntu/.config/rclone/rclone.conf \
  /etc/vndb/rclone.conf
sudo chmod 0600 /home/ubuntu/.config/rclone/rclone.conf
sudo rclone config --config /etc/vndb/rclone.conf
```

In the interactive rclone configuration, create `vndb-offsite` with these choices:

- Storage type: `crypt`
- Remote to encrypt: `gdrive:vndb-production-backups`
- File-name encryption: standard
- Directory-name encryption: enabled
- New independent passwords generated for this backup target

Do not reuse an application password or place cleartext passwords in a unit file. Confirm the new remote without showing its configuration:

```bash
sudo test "$(stat -c '%a' /etc/vndb/rclone.conf)" = 600
sudo rclone lsd --config /etc/vndb/rclone.conf vndb-offsite:
```

Copy the completed root configuration to an approved credential escrow that is independent of this server and Google Drive. That escrow is required to recover the crypt passwords after total host loss. Keep both server copies mode `0600`; rclone's stored obscured values are reversible and must be treated as credentials.

Install the scripts and units:

```bash
sudo install -o root -g root -m 0755 \
  ops/backup/vndb-rclone-common.sh \
  /usr/local/sbin/vndb-rclone-common.sh
sudo install -o root -g root -m 0755 \
  ops/backup/vndb-offsite-replicate \
  /usr/local/sbin/vndb-offsite-replicate
sudo install -o root -g root -m 0755 \
  ops/backup/vndb-offsite-restore-drill \
  /usr/local/sbin/vndb-offsite-restore-drill
sudo install -o root -g root -m 0644 \
  ops/systemd/vndb-offsite-replicate.service \
  ops/systemd/vndb-offsite-replicate.timer \
  ops/systemd/vndb-offsite-restore-drill.service \
  ops/systemd/vndb-offsite-restore-drill.timer \
  /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start vndb-offsite-replicate.service
sudo systemctl start vndb-offsite-restore-drill.service
sudo systemctl enable --now \
  vndb-offsite-replicate.timer \
  vndb-offsite-restore-drill.timer
```

Replication runs after the daily database and weekly storage backups. The restore drill runs each Monday after replication. The drill downloads the newest encrypted PostgreSQL and storage pairs, verifies their SHA-256 sidecars, restores PostgreSQL to a temporary isolated database, checks migration rows, invalid indexes, VN rows, and cache rows, safely extracts the storage archive, confirms it contains files, then deletes all drill data.

## Routine verification

```bash
systemctl list-timers \
  vndb-offsite-replicate.timer \
  vndb-offsite-restore-drill.timer
systemctl status vndb-offsite-replicate.service --no-pager
systemctl status vndb-offsite-restore-drill.service --no-pager
journalctl -u vndb-offsite-replicate.service -n 100 --no-pager
journalctl -u vndb-offsite-restore-drill.service -n 100 --no-pager
```

A successful upload is not a restore result. Treat the weekly drill log as the recovery evidence. Investigate any missed timer, checksum failure, invalid index, empty restored database, empty storage archive, or insufficient disk preflight before the next backup window.

## Recovery outline

1. Provision a compatible PostgreSQL server and an empty storage directory.
2. Install rclone and recover `/etc/vndb/rclone.conf` from the separate credentials escrow.
3. Download the selected database dump, storage archive, and both SHA-256 sidecars through `vndb-offsite`.
4. Verify both hashes before reading the archives.
5. Run `pg_restore --list`, then restore with `--exit-on-error --no-owner --no-privileges` into an empty database.
6. Validate `schema_migration`, application row counts, foreign keys, and invalid indexes.
7. Validate storage archive paths before extraction, extract it, and compare file counts.
8. Configure the application, run readiness checks on loopback, and only then restore public traffic.
