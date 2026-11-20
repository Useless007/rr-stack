# RR stack

React Router + Rust (Axum), typed from the database to the screen.

```bash
bun create rr-stack my-app
```

Made for a team where AI agents write most of the code and people review it. One command,
`scripts/check.sh`, answers "is it done?". If it exits 0, the SQL, the Rust API, the OpenAPI
contract and the React code agree with each other.

> **If you are an AI agent:** read this file for the map, then follow `AGENTS.md` in the project root.
> Your task is done only when `scripts/check.sh` exits 0.

## What you get

| Layer | Tool | What is checked, and when |
|---|---|---|
| Database | Postgres + SQLx `query!` | SQL against the real schema, at compile time |
| API | Axum + utoipa | `openapi.json` is derived from the Rust handlers |
| Contract | `openapi.json` | regenerated and diffed on every check |
| Client | hey-api + TanStack Query | TS client and hooks generated from the contract |
| UI | React Router (`ssr: false` + `prerender`) | `tsc --noEmit` and a full build |

In production it is one process. Axum serves `/api/*` and the built pages. There is no Node at
runtime.

## Requirements

- Rust (stable), [bun](https://bun.sh), Docker
- `cargo install sqlx-cli --no-default-features --features postgres,rustls`

## Create a project

```bash
bun create rr-stack my-app        # --no-install and --no-git skip those steps
cd my-app
docker compose up -d --wait
(cd server && sqlx migrate run)
scripts/check.sh                  # expect "check OK" on the last line
```

The CLI copies the template and renames the packages to `my-app-server` and `my-app-web`. Each
project gets its own Postgres database name and host port (54000-54999), so two projects can run at
the same time. It also writes `.env`, runs `bun install` and runs `git init`.

## Run it

```bash
(cd server && cargo run)          # API on :3000, reads ../.env
(cd web && bun run dev)           # UI on :5173, /api is proxied to :3000
```

Open http://localhost:5173 (a prerendered page) and http://localhost:5173/app/todos (the SPA).

## Commands

| Command | Exit 0 means | Run it when |
|---|---|---|
| `scripts/check.sh` | fmt, clippy, contract, typecheck, web build, `.sqlx`, tests all pass | before you call anything done |
| `scripts/smoke.sh` | the real binary serves pages, deep links and the API over HTTP | you changed how files or routes are served |
| `cd web && bun run gen` | `openapi.json` and `web/app/api/` regenerated | you changed a handler or a type that crosses the wire |
| `cd server && cargo sqlx prepare -- --all-targets` | `server/.sqlx/` matches the SQL | you added or changed a query |

`check.sh` needs the database. Without `DATABASE_URL` it fails on purpose. `SKIP_DB=1` runs the
rest, and the output says that the result is not done.

## Where things are

```
server/src/lib.rs        api_router(): every route is registered here (spec + runtime)
server/src/todos.rs      example domain: TodoTitle validates input at the boundary
server/migrations/       database schema (source of truth for tables)
server/tests/            integration tests, each gets a fresh database (#[sqlx::test])
web/app/routes.ts        page routes
web/app/api/             GENERATED client, never edit by hand
web/react-router.config.ts   prerender list: pages that search engines must see
openapi.json             GENERATED contract, never edit by hand
scripts/check.sh         definition of done
```

## How a change flows

1. Change the SQL in a migration, or add a query with `query!`.
2. Change the Rust handler and its `ToSchema` types. Then register the route in `api_router()`.
3. `cd web && bun run gen` regenerates the contract and the client.
4. Use the generated `<operationId>Options()` or `<operationId>Mutation()` in a route.
5. `scripts/check.sh`. If a layer disagrees with another, this is where it fails.

## SEO pages and the app

Paths in `prerender` (`web/react-router.config.ts`) are rendered to HTML at build time, so search
engines see their content. Every other route is a SPA behind the same server, and deep links work
because Axum falls back to the SPA shell. Unknown `/api/*` paths return a JSON 404, never HTML.
In this version, prerendered pages cannot fetch from the API at build time.

## Production

```bash
(cd web && bun run build)
(cd server && cargo build --release)
WEB_DIST=web/build/client DATABASE_URL=postgres://... server/target/release/server
```

The server runs migrations on startup.

## Not included yet

Auth, server-side rendering (`ssr: true`), structured JSON error bodies, deploy recipes.

## License

MIT
