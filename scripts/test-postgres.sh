#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  yarn db:postgres:test:down
}

trap cleanup EXIT INT TERM
yarn db:postgres:test:up
export POSTGRES_TEST_URL='postgresql://vndb_test:vndb-test-only@127.0.0.1:55433/vndb_collection_test'
yarn test:postgres:run
