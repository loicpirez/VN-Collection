#!/usr/bin/env bash
set -Eeuo pipefail

readonly site="${VNDB_NGINX_SITE:-/etc/nginx/sites-available/vndb}"

if [[ "$(id -u)" -ne 0 ]]; then
  printf 'Run this operation as root.\n' >&2
  exit 1
fi
if [[ ! -f "$site" || -L "$site" ]]; then
  printf 'Expected a regular nginx site file: %s\n' "$site" >&2
  exit 1
fi

ipv4_count="$(grep -Ec '^[[:space:]]*listen[[:space:]]+443[[:space:]]+ssl;([[:space:]]*#.*)?$' "$site")"
ipv6_count="$(grep -Ec '^[[:space:]]*listen[[:space:]]+\[::\]:443[[:space:]]+ssl[[:space:]]+ipv6only=on;([[:space:]]*#.*)?$' "$site")"
if [[ "$ipv4_count" -ne 1 || "$ipv6_count" -ne 1 ]]; then
  printf 'Refusing HTTP/2 edit because the expected TLS listen directives were not found exactly once.\n' >&2
  exit 1
fi

backup="${site}.pre-http2.$(date -u +%Y%m%dT%H%M%SZ)"
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
negotiated_protocol="$(curl --silent --show-error --http2 -o /dev/null -w '%{http_version}' \
  --resolve 'ns503173.ip-192-99-7.net:443:127.0.0.1' \
  'https://ns503173.ip-192-99-7.net/api/health?check=live')"
if [[ "$negotiated_protocol" != "2" ]]; then
  cp --preserve=mode,ownership,timestamps "$backup" "$site"
  nginx -t
  systemctl reload nginx
  printf 'Nginx reloaded but negotiated HTTP/%s instead of HTTP/2.\n' "$negotiated_protocol" >&2
  exit 1
fi
printf 'HTTP/2 enabled and verified. Backup: %s\n' "$backup"
