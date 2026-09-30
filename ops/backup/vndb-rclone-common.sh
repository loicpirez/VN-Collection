#!/usr/bin/env bash
set -Eeuo pipefail

vndb_require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    printf 'Refusing to run outside the root backup service.\n' >&2
    return 1
  fi
}

vndb_require_uint() {
  local name="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    printf '%s must be a non-negative integer.\n' "$name" >&2
    return 1
  fi
}

vndb_require_rclone_crypt() {
  local config="$1"
  local destination="$2"
  local remote_name="${destination%%:*}"
  local permissions

  if [[ ! -f "$config" || ! -r "$config" ]]; then
    printf 'Rclone configuration is not a readable regular file: %s\n' "$config" >&2
    return 1
  fi
  permissions="$(stat -c '%a' "$config" 2>/dev/null || stat -f '%Lp' "$config")"
  if [[ ! "$permissions" =~ ^[0-7]{3,4}$ ]] || (((8#$permissions & 077) != 0)); then
    printf 'Rclone configuration must not grant group or world permissions: %s\n' "$config" >&2
    return 1
  fi
  if [[ -z "$remote_name" || "$destination" != *:* ]]; then
    printf 'VNDB_OFFSITE_REMOTE must name an rclone remote and path.\n' >&2
    return 1
  fi
  if ! rclone config redacted --config "$config" "$remote_name" |
    awk '$0 == "type = crypt" { found = 1 } END { exit(found ? 0 : 1) }'
  then
    printf 'Refusing a non-crypt off-site destination: %s\n' "$remote_name" >&2
    return 1
  fi
}

vndb_verify_checksum_sidecar() {
  local sidecar="$1"
  local file="$2"
  local expected
  local actual

  expected="$(awk 'NR == 1 { print $1 }' "$sidecar")"
  if [[ ! "$expected" =~ ^[0-9a-f]{64}$ ]]; then
    printf 'Invalid SHA-256 sidecar: %s\n' "$sidecar" >&2
    return 1
  fi
  actual="$(sha256sum "$file" | awk 'NR == 1 { print $1 }')"
  if [[ "$actual" != "$expected" ]]; then
    printf 'SHA-256 verification failed: %s\n' "$file" >&2
    return 1
  fi
}
