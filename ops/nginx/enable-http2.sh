#!/usr/bin/env bash
set -Eeuo pipefail

readonly site_entry="${VNDB_NGINX_SITE:-/etc/nginx/sites-enabled/vndb}"
readonly backup_directory="${VNDB_NGINX_BACKUP_DIR:-/var/backups/vndb/nginx}"

if [[ "$(id -u)" -ne 0 ]]; then
  printf 'Run this operation as root.\n' >&2
  exit 1
fi
if [[ ! -e "$site_entry" ]]; then
  printf 'Expected an enabled nginx site entry: %s\n' "$site_entry" >&2
  exit 1
fi
readonly site="$(readlink -f -- "$site_entry")"
if [[ ! -f "$site" ]]; then
  printf 'Expected the enabled nginx site to resolve to a regular file: %s\n' "$site_entry" >&2
  exit 1
fi

plain_ipv4_count="$(grep -Ec '^[[:space:]]*listen[[:space:]]+443[[:space:]]+ssl;([[:space:]]*#.*)?$' "$site" || true)"
plain_ipv6_count="$(grep -Ec '^[[:space:]]*listen[[:space:]]+\[::\]:443[[:space:]]+ssl[[:space:]]+ipv6only=on;([[:space:]]*#.*)?$' "$site" || true)"
http2_ipv4_count="$(grep -Ec '^[[:space:]]*listen[[:space:]]+443[[:space:]]+ssl[[:space:]]+http2;([[:space:]]*#.*)?$' "$site" || true)"
http2_ipv6_count="$(grep -Ec '^[[:space:]]*listen[[:space:]]+\[::\]:443[[:space:]]+ssl[[:space:]]+http2[[:space:]]+ipv6only=on;([[:space:]]*#.*)?$' "$site" || true)"

verify_http2() {
  local attempt
  local protocol=""
  for attempt in {1..10}; do
    protocol="$(curl --silent --show-error --http2 -o /dev/null -w '%{http_version}' \
      --resolve 'ns503173.ip-192-99-7.net:443:127.0.0.1' \
      'https://ns503173.ip-192-99-7.net/api/health?check=live' 2>/dev/null || true)"
    if [[ "$protocol" == "2" ]]; then
      return 0
    fi
    sleep 1
  done
  printf 'Nginx negotiated HTTP/%s instead of HTTP/2 after reload.\n' "${protocol:-unavailable}" >&2
  return 1
}

if [[ "$http2_ipv4_count" -eq 1 && "$http2_ipv6_count" -eq 1 &&
      "$plain_ipv4_count" -eq 0 && "$plain_ipv6_count" -eq 0 ]]; then
  verify_http2
  printf 'HTTP/2 was already enabled and is verified.\n'
  exit 0
fi
if [[ "$plain_ipv4_count" -ne 1 || "$plain_ipv6_count" -ne 1 ||
      "$http2_ipv4_count" -ne 0 || "$http2_ipv6_count" -ne 0 ]]; then
  printf 'Refusing HTTP/2 edit because the expected TLS listen directives were not found exactly once.\n' >&2
  exit 1
fi

install -d -o root -g root -m 0700 "$backup_directory"
backup="${backup_directory%/}/vndb.pre-http2.$(date -u +%Y%m%dT%H%M%SZ)"
temporary="$(mktemp "${site}.http2.XXXXXX")"
trap 'rm -f "$temporary"' EXIT
cp --preserve=mode,ownership,timestamps "$site" "$backup"
sed \
  -e 's/^\([[:space:]]*listen[[:space:]]\+443[[:space:]]\+ssl\);/\1 http2;/' \
  -e 's/^\([[:space:]]*listen[[:space:]]\+\[::\]:443[[:space:]]\+ssl\)[[:space:]]\+ipv6only=on;/\1 http2 ipv6only=on;/' \
  "$site" >"$temporary"
chown --reference="$site" "$temporary"
chmod --reference="$site" "$temporary"
mv "$temporary" "$site"

if ! nginx -t; then
  cp --preserve=mode,ownership,timestamps "$backup" "$site"
  nginx -t
  printf 'HTTP/2 edit failed validation and was rolled back.\n' >&2
  exit 1
fi

systemctl reload nginx
if ! verify_http2; then
  cp --preserve=mode,ownership,timestamps "$backup" "$site"
  nginx -t
  systemctl reload nginx
  exit 1
fi
printf 'HTTP/2 enabled and verified. Backup: %s\n' "$backup"
