# Production host maintenance

## Measured state on 2026-10-01

The host runs Ubuntu 24.04.4 LTS with kernel `6.8.0-117-generic` and has been up for more than 18 weeks. Fifty packages are upgradable. The pending set includes AppArmor, audit, Kerberos, containerd, Docker, firmware, Node.js, netplan, snapd, and operating-system support packages. `/var/run/reboot-required` exists and names accumulated kernel, libc, and linux-base updates. Unattended upgrades is enabled and active, but the active kernel remains behind the pending kernel packages.

Nginx is Ubuntu nginx 1.24.0. Its TLS listeners are `listen 443 ssl` and `listen [::]:443 ssl ipv6only=on`, so the public endpoint negotiates HTTP/1.1. This nginx version enables HTTP/2 with the `http2` listen parameter. The host curl build includes nghttp2 and can verify protocol negotiation.

## HTTP/2 operation

Install and run the guarded operation:

```bash
sudo install -o root -g root -m 0755 \
  ops/nginx/enable-http2.sh \
  /usr/local/sbin/vndb-enable-http2
sudo /usr/local/sbin/vndb-enable-http2
```

The operation resolves the enabled `/etc/nginx/sites-enabled/vndb` entry to its
active regular file, requires each expected TLS listen directive exactly once,
creates a timestamped copy under root-only `/var/backups/vndb/nginx`, adds the
nginx 1.24 HTTP/2 parameters, runs `nginx -t`, reloads nginx, and verifies
loopback TLS negotiation. Keeping the backup outside `sites-enabled` prevents
nginx's wildcard include from loading it as a second virtual host. The operation
waits for replacement workers to negotiate HTTP/2 after reload, accepts an
already-enabled and verified configuration, and restores the previous file if
syntax validation or protocol verification fails. This resolution also handles hosts where
`sites-enabled/vndb` is a regular deployment-managed copy instead of a symlink
to `sites-available`.

Recheck the public endpoint from a second machine:

```bash
curl --silent --show-error --http2 -o /dev/null \
  -w 'HTTP/%{http_version} status=%{http_code}\n' \
  https://ns503173.ip-192-99-7.net/
```

The unauthenticated status is expected to remain `401`; the negotiated version must be `2`.

## Package and reboot operation

First confirm current backups and enough free space:

```bash
systemctl status vndb-postgres-backup.service --no-pager
systemctl status vndb-storage-backup.service --no-pager
systemctl status vndb-offsite-replicate.service --no-pager
systemctl status vndb-offsite-restore-drill.service --no-pager
df -h /
df -i /
sudo nginx -t
curl --fail --silent --show-error http://127.0.0.1:3000/api/health?check=ready
```

Review and stage the exact package transaction before the maintenance window:

```bash
sudo apt-get update
apt list --upgradable
sudo apt-get --download-only dist-upgrade
```

During the announced maintenance window:

```bash
sudo systemctl stop vndb.service
sudo apt-get dist-upgrade
sudo reboot
```

After SSH returns, validate the active kernel and every public dependency before ending maintenance:

```bash
uname -r
test ! -e /var/run/reboot-required
systemctl --failed --no-pager
systemctl is-active postgresql nginx vndb
sudo nginx -t
curl --fail --silent --show-error http://127.0.0.1:3000/api/health?check=ready
curl --silent --show-error --http2 -o /dev/null \
  -w 'HTTP/%{http_version} status=%{http_code}\n' \
  https://ns503173.ip-192-99-7.net/
sudo -u postgres psql -X -d vndb_collection -c \
  "SELECT COUNT(*) AS invalid_indexes FROM pg_index WHERE NOT indisvalid;"
systemctl list-timers \
  vndb-postgres-backup.timer \
  vndb-storage-backup.timer \
  vndb-offsite-replicate.timer \
  vndb-offsite-restore-drill.timer \
  vndb-cache-prune.timer
```

If the application readiness check fails, keep public traffic closed, inspect `journalctl -u vndb.service -b`, and restore the previous immutable application release if the failure is application-specific. Package rollback is package-specific; capture the full apt transaction output and `/var/log/apt/history.log` before changing versions.
