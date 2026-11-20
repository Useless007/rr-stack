#!/usr/bin/env bash
# The definition of done. Exit 0 means SQL, Rust, the OpenAPI contract and the React code agree.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$root/.env" ] && { set -a; . "$root/.env"; set +a; }
export SQLX_OFFLINE=true
step() { printf '\n== %s\n' "$*"; }

cd "$root/server"
step "rustfmt"
cargo fmt --check
step "clippy (offline SQL metadata from .sqlx/)"
cargo clippy -q --all-targets -- -D warnings

step "contract: openapi.json and web/app/api match a fresh generation"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cargo run -q --bin openapi > "$tmp/openapi.json"
(cd "$root/web" && RR_OPENAPI="$tmp/openapi.json" RR_API_OUT="$tmp/api" bunx openapi-ts >/dev/null)
if ! diff -q "$root/openapi.json" "$tmp/openapi.json" >/dev/null || ! diff -rq "$root/web/app/api" "$tmp/api" >/dev/null; then
  diff -ru "$root/openapi.json" "$tmp/openapi.json" | head -20 || true
  diff -rq "$root/web/app/api" "$tmp/api" || true
  echo "generated files are stale or hand-edited: run 'cd web && bun run gen' and commit" >&2
  exit 1
fi

step "typecheck"
(cd "$root/web" && bun run typecheck >/dev/null)

if [ -n "${DATABASE_URL:-}" ]; then
  command -v sqlx >/dev/null || { echo "sqlx-cli missing: cargo install sqlx-cli --no-default-features --features postgres,rustls" >&2; exit 1; }
  step "migrations + .sqlx/ up to date"
  sqlx migrate run >/dev/null
  cargo sqlx prepare --check -- --all-targets
  step "tests"
  cargo test -q
else
  echo "DATABASE_URL not set: skipped .sqlx check and tests"
fi
echo; echo "check OK"
