#!/usr/bin/env bash

release_storage_is_uint() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

release_storage_canonical_directory() {
  (
    cd -P -- "$1" 2>/dev/null
    pwd -P
  )
}

release_storage_is_release_directory() {
  local release_store="$1"
  local candidate="$2"
  local canonical_store
  local canonical_candidate

  [[ -d "$release_store" && -d "$candidate" && ! -L "$candidate" ]] || return 1
  [[ "$(basename -- "$candidate")" =~ ^[0-9a-f]{40}$ ]] || return 1

  canonical_store="$(release_storage_canonical_directory "$release_store")" || return 1
  canonical_candidate="$(release_storage_canonical_directory "$candidate")" || return 1
  [[ "$(dirname -- "$canonical_candidate")" == "$canonical_store" ]]
}

release_storage_assert_capacity_values() {
  local available_bytes="$1"
  local available_inodes="$2"
  local required_bytes="$3"
  local required_inodes="$4"

  for value in "$available_bytes" "$available_inodes" "$required_bytes" "$required_inodes"; do
    release_storage_is_uint "$value" || {
      printf 'Refusing deployment: release capacity values must be non-negative integers.\n' >&2
      return 1
    }
  done

  if ((available_bytes < required_bytes)); then
    printf 'Refusing deployment: release filesystem has %s bytes free; %s are required.\n' \
      "$available_bytes" "$required_bytes" >&2
    return 1
  fi
  if ((available_inodes < required_inodes)); then
    printf 'Refusing deployment: release filesystem has %s inodes free; %s are required.\n' \
      "$available_inodes" "$required_inodes" >&2
    return 1
  fi
}

release_storage_preflight() {
  local release_store="$1"
  local required_bytes="$2"
  local required_inodes="$3"
  local available_kib
  local available_bytes
  local available_inodes

  release_storage_is_uint "$required_bytes" && release_storage_is_uint "$required_inodes" || {
    printf 'Refusing deployment: VN_DEPLOY_MIN_FREE_BYTES and VN_DEPLOY_MIN_FREE_INODES must be non-negative integers.\n' >&2
    return 1
  }

  available_kib="$(LC_ALL=C df -Pk -- "$release_store" | awk 'NR == 2 { print $4 }')"
  available_inodes="$(LC_ALL=C df -Pi -- "$release_store" | awk '
    NR == 1 {
      for (column = 1; column <= NF; column += 1) {
        if (tolower($column) == "ifree" || tolower($column) == "iavail") inode_column = column
      }
      next
    }
    NR == 2 && inode_column > 0 { print $inode_column }
  ')"
  release_storage_is_uint "$available_kib" && release_storage_is_uint "$available_inodes" || {
    printf 'Refusing deployment: unable to read release filesystem capacity.\n' >&2
    return 1
  }
  available_bytes="$((available_kib * 1024))"

  printf 'Release capacity: %s bytes and %s inodes free.\n' "$available_bytes" "$available_inodes"
  release_storage_assert_capacity_values \
    "$available_bytes" "$available_inodes" "$required_bytes" "$required_inodes"
}

release_storage_mtime() {
  stat -c '%Y' -- "$1" 2>/dev/null || stat -f '%m' -- "$1"
}

release_storage_is_protected() {
  local candidate="$1"
  shift
  local protected
  local canonical_candidate
  local canonical_protected

  canonical_candidate="$(release_storage_canonical_directory "$candidate")" || return 1
  for protected in "$@"; do
    [[ -d "$protected" ]] || continue
    canonical_protected="$(release_storage_canonical_directory "$protected")" || continue
    if [[ "$canonical_candidate" == "$canonical_protected" ]]; then
      return 0
    fi
  done
  return 1
}

release_storage_list_prunable() {
  local release_store="$1"
  local retained_recent="$2"
  shift 2
  local candidate
  local retained=0

  release_storage_is_uint "$retained_recent" || {
    printf 'Refusing deployment: VN_DEPLOY_RELEASE_RETENTION must be a non-negative integer.\n' >&2
    return 1
  }

  while IFS='|' read -r _mtime candidate; do
    [[ -n "$candidate" ]] || continue
    if release_storage_is_protected "$candidate" "$@"; then
      continue
    fi
    if ((retained < retained_recent)); then
      retained="$((retained + 1))"
      continue
    fi
    printf '%s\n' "$candidate"
  done < <(
    for candidate in "$release_store"/*; do
      [[ -e "$candidate" || -L "$candidate" ]] || continue
      if release_storage_is_release_directory "$release_store" "$candidate"; then
        printf '%s|%s\n' "$(release_storage_mtime "$candidate")" "$candidate"
      else
        printf 'Skipping unrecognized release-store entry: %s\n' "$candidate" >&2
      fi
    done | LC_ALL=C sort -t '|' -k1,1nr
  )
}
