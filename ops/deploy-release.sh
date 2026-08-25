#!/usr/bin/env bash
set -Eeuo pipefail

service_name="${VN_DEPLOY_SERVICE:-vndb}"
candidate_port="${VN_DEPLOY_CANDIDATE_PORT:-3001}"
live_port="${VN_DEPLOY_LIVE_PORT:-3000}"
candidate_pid=""
build_dir=""
switched=0

usage() {
  printf 'Usage:\n'
  printf '  %s inspect\n' "$0"
  printf '  %s deploy <git-bundle> <full-commit-sha>\n' "$0"
}

cleanup() {
  if [[ -n "$candidate_pid" ]] && kill -0 "$candidate_pid" 2>/dev/null; then
    kill "$candidate_pid" 2>/dev/null || true
    wait "$candidate_pid" 2>/dev/null || true
  fi
  if [[ -n "$build_dir" && -d "$build_dir" ]]; then
    rm -rf "$build_dir"
  fi
}

trap cleanup EXIT

working_dir="$(systemctl show "$service_name" --property=WorkingDirectory --value)"
exec_start="$(systemctl show "$service_name" --property=ExecStart --value)"
environment_files="$(systemctl show "$service_name" --property=EnvironmentFiles --value)"

if [[ -z "$working_dir" || "$working_dir" != /* ]]; then
  printf 'Refusing deployment: systemd WorkingDirectory is not an absolute path.\n' >&2
  exit 1
fi
if [[ ! -L "$working_dir" ]]; then
  printf 'Refusing deployment: %s is not the active release symlink.\n' "$working_dir" >&2
  exit 1
fi
expected_server="$working_dir/.next/standalone/server.js"
if [[ "$exec_start" != *"$expected_server"* ]]; then
  printf 'Refusing deployment: systemd ExecStart does not use %s.\n' "$expected_server" >&2
  exit 1
fi

old_target="$(readlink -f "$working_dir")"
release_store="$(dirname "$old_target")"
if [[ ! -d "$release_store" || "$old_target" != "$release_store"/* ]]; then
  printf 'Refusing deployment: the active release target is invalid.\n' >&2
  exit 1
fi

printf 'Service: %s\n' "$service_name"
printf 'Active symlink: %s\n' "$working_dir"
printf 'Active release: %s\n' "$old_target"
printf 'Release store: %s\n' "$release_store"

mode="${1:-}"
if [[ "$mode" == "inspect" ]]; then
  exit 0
fi
if [[ "$mode" != "deploy" || "$#" -ne 3 ]]; then
  usage >&2
  exit 2
fi

bundle_path="$2"
commit_sha="$3"
if [[ ! -f "$bundle_path" ]]; then
  printf 'Refusing deployment: bundle does not exist: %s\n' "$bundle_path" >&2
  exit 1
fi
if [[ ! "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Refusing deployment: commit SHA must contain 40 lowercase hexadecimal characters.\n' >&2
  exit 1
fi

release_dir="$release_store/$commit_sha"
if [[ -e "$release_dir" ]]; then
  printf 'Refusing deployment: immutable release already exists: %s\n' "$release_dir" >&2
  exit 1
fi

environment_file="${VN_DEPLOY_ENV_FILE:-${environment_files%% *}}"
if [[ -z "$environment_file" || ! -r "$environment_file" ]]; then
  printf 'Refusing deployment: environment file is not readable.\n' >&2
  exit 1
fi
migration_environment_file="${VN_DEPLOY_MIGRATION_ENV_FILE:-$(dirname "$environment_file")/migration.env}"
if [[ -z "$migration_environment_file" || ! -r "$migration_environment_file" ]]; then
  printf 'Refusing deployment: migration environment file is not readable.\n' >&2
  exit 1
fi

wait_for_health() {
  local port="$1"
  local attempts="$2"
  local response=""
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if response="$(curl --fail --silent --show-error "http://127.0.0.1:${port}/api/health" 2>&1)" &&
      HEALTH_RESPONSE="$response" node -e '
        const value = JSON.parse(process.env.HEALTH_RESPONSE ?? "null");
        if (value?.status !== "ok" || value?.database !== "available") process.exit(1);
      '
    then
      printf '%s\n' "$response"
      return 0
    fi
    sleep 1
  done
  printf 'Health check failed on port %s: %s\n' "$port" "$response" >&2
  return 1
}

rollback() {
  if [[ "$switched" -ne 1 ]]; then
    return
  fi
  printf 'Activation failed. Restoring %s.\n' "$old_target" >&2
  rollback_link="$(dirname "$working_dir")/.vndb-rollback-${commit_sha}"
  sudo ln -s "$old_target" "$rollback_link"
  sudo mv -Tf "$rollback_link" "$working_dir"
  sudo systemctl restart "$service_name"
  wait_for_health "$live_port" 60
  switched=0
}

build_dir="$(mktemp -d "${TMPDIR:-/tmp}/vndb-build.${commit_sha}.XXXXXX")"
git clone "$bundle_path" "$build_dir"
git -C "$build_dir" checkout "$commit_sha"
resolved_sha="$(git -C "$build_dir" rev-parse HEAD)"
if [[ "$resolved_sha" != "$commit_sha" ]]; then
  printf 'Refusing deployment: bundle resolved to %s instead of %s.\n' "$resolved_sha" "$commit_sha" >&2
  exit 1
fi

cd "$build_dir"
set -a
. "$environment_file"
set +a
yarn install --frozen-lockfile
(
  set -a
  . "$migration_environment_file"
  set +a
  yarn db:postgres:apply
)
yarn build
cp -R .next/static .next/standalone/.next/static
cp -R public .next/standalone/public

candidate_log="${TMPDIR:-/tmp}/vndb-candidate-${commit_sha}.log"
HOSTNAME=127.0.0.1 PORT="$candidate_port" node .next/standalone/server.js >"$candidate_log" 2>&1 &
candidate_pid=$!
if ! wait_for_health "$candidate_port" 60; then
  cat "$candidate_log" >&2
  exit 1
fi
kill "$candidate_pid"
wait "$candidate_pid" || true
candidate_pid=""

sudo mv "$build_dir" "$release_dir"
build_dir=""
next_link="$(dirname "$working_dir")/.vndb-current-${commit_sha}"
sudo ln -s "$release_dir" "$next_link"
sudo mv -Tf "$next_link" "$working_dir"
switched=1

if ! sudo systemctl restart "$service_name" || ! wait_for_health "$live_port" 60; then
  rollback
  exit 1
fi

active_target="$(readlink -f "$working_dir")"
active_sha="$(git -C "$working_dir" rev-parse HEAD)"
main_pid="$(systemctl show "$service_name" --property=MainPID --value)"
process_working_dir="$(readlink -f "/proc/$main_pid/cwd")"
expected_process_working_dir="$release_dir/.next/standalone"
if [[ "$active_target" != "$release_dir" || "$active_sha" != "$commit_sha" || "$process_working_dir" != "$expected_process_working_dir" ]]; then
  printf 'Activation verification failed for %s.\n' "$commit_sha" >&2
  printf 'Active target: %s\n' "$active_target" >&2
  printf 'Active commit: %s\n' "$active_sha" >&2
  printf 'Process directory: %s\n' "$process_working_dir" >&2
  rollback
  exit 1
fi

systemctl is-active "$service_name"
printf 'Activated release: %s\n' "$active_target"
printf 'Running commit: %s\n' "$active_sha"
printf 'Service restarts: %s\n' "$(systemctl show "$service_name" --property=NRestarts --value)"
switched=0
