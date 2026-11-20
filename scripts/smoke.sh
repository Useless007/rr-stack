#!/usr/bin/env bash
# Builds the web app, runs the real server binary, and checks what a browser and an API client get.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$root/.env" ] && { set -a; . "$root/.env"; set +a; }
: "${DATABASE_URL:?DATABASE_URL must be set (cp .env.example .env)}"

(cd "$root/web" && bun run build >/dev/null 2>&1)
(cd "$root/server" && cargo build -q --bin server)

port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
PORT="$port" WEB_DIST="$root/web/build/client" "$root/server/target/debug/server" >/dev/null 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT
base="http://127.0.0.1:$port"
for _ in $(seq 50); do curl -sf "$base/api/health" >/dev/null && break; sleep 0.2; done

fail() { echo "smoke FAIL: $*" >&2; exit 1; }
expect() { # expect <status> <method> <path> [body]
  local out; out="$(mktemp)"
  local code; code="$(curl -s -o "$out" -w '%{http_code} %{content_type}' -X "$2" -H 'content-type: application/json' ${4:+--data "$4"} "$base$3")"
  [[ "${code%% *}" == "$1" ]] || fail "$2 $3 → $code, want $1"
  cat "$out"; rm -f "$out"
}

expect 200 GET / | grep -q 'RR stack</h1>' || fail "/ is not the prerendered landing page"
expect 200 GET /app/todos | grep -q '<script' || fail "/app/todos did not return the SPA fallback"
curl -s -o /dev/null -w '%{content_type}' "$base/api/nope" | grep -q '^application/json' || fail "/api/nope is not JSON"
expect 404 GET /api/nope >/dev/null
expect 201 POST /api/todos '{"title":"smoke"}' >/dev/null
echo "smoke OK"
