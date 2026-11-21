# RR stack

React Router + Rust (Axum), typed from the database to the screen.

```bash
bun create rr-stack my-app
```

Made for a team where AI agents write most of the code and people review it. One command,
`bun run check`, answers "is it done?". If it exits 0, the SQL, the Rust API, the OpenAPI
contract and the React code agree with each other.

Works the same on Windows, macOS and Linux: every project command is a bun script.

> **If you are an AI agent:** read this file for the map, then follow `AGENTS.md` in the project root.
> Your task is done only when `bun run check` exits 0.

## What you get

| Layer | Tool | What is checked, and when |
|---|---|---|
| Database | Postgres + SQLx `query!` | SQL against the real schema, at compile time |
| API | Axum + utoipa | `openapi.json` is derived from the Rust handlers |
| Contract | `openapi.json` | regenerated and diffed on every check |
| Client | hey-api + TanStack Query | TS client, hooks and typed errors generated from the contract |
| UI | React Router (`prerender` + SPA, or `ssr: true` with `--ssr`) | `tsc --noEmit` and a full build |

A new project is a small working site about the stack itself, with one example of each thing you
will need:

| Page | Shows |
|---|---|
| `/` | a prerendered landing page with a live API status |
| `/how-it-works` | prerendered; the layers and how a change travels through them |
| `/api-reference` | prerendered from `openapi.json` at build time, no API call |
| `/app` | dashboard: an aggregate SQL query (`GET /api/stats`) |
| `/app/todos` | list with filters and search in the URL (query params), create, optimistic toggle, delete, live updates over a WebSocket |
| `/app/todos/:id` | path params, edit, typed 404 from the API |
| `/sign-in` | register and sign in: Argon2id, HttpOnly session cookie, owner-only edits (403) |
| any other path | the app's 404 page |
| `/robots.txt`, `/sitemap.xml` | generated at build time from the public pages |

By default production is one process: Axum serves `/api/*` and the built pages, with no Node at
runtime. A project created with `--ssr` adds one bun process that renders pages on each request;
Axum stays in front (see [Rendering](#rendering)).

## Requirements

- To run it with Docker only: Docker (Docker Desktop on Windows and macOS).
- To develop: also Rust (stable), [bun](https://bun.sh) 1.4+ (no Node needed: React Router runs
  on bun), git, and
  `cargo install sqlx-cli --no-default-features --features postgres,rustls`.

## Try it with Docker

```bash
bun create rr-stack my-app
cd my-app
docker compose up -d
```

The CLI prints the address (each project gets its own port). The first build compiles the Rust
server in release mode, which takes a few minutes. `docker compose down` stops it; the database
volume stays.

## Develop

```bash
cd my-app
bun run dev
```

`bun run dev` starts only Postgres in Docker, then the Rust API on :3000 and the app on :5173 with
`/api` proxied to the API. Edit a file and the page updates. Ctrl+C stops the API and the app; the
database keeps running. The first run compiles the Rust server, which takes a minute.

## Commands

| Command | Exit 0 means | Run it when |
|---|---|---|
| `bun run dev` | (keeps running) | you are working on the app |
| `bun run check` | fmt, clippy, contract, typecheck, web build, `.sqlx`, tests all pass | before you call anything done |
| `bun run smoke` | the real binary serves pages, deep links and the API over HTTP | you changed how files or routes are served |
| `bun run e2e` | a real browser opened every page and walked the todo flow with no errors; screenshots of failures in `web/e2e/results/` | you changed anything under `web/app` |
| `bun run gen` | `openapi.json` and `web/app/api/` regenerated | you changed a handler or a type that crosses the wire |
| `cargo sqlx prepare -- --all-targets`, run in `server/` | `server/.sqlx/` matches the SQL | you added or changed a query |
| `docker compose up -d` | the whole app runs in containers | you want to run it without a toolchain |

`bun run check` needs the database (`bun run dev` or `docker compose up -d --wait db` starts it)
and `sqlx-cli`. Without `DATABASE_URL` it fails on purpose. `SKIP_DB=1` runs the rest, and the
output says that the result is not done.

## Where things are

```
server/src/lib.rs        api_router(): every route is registered here (spec + runtime)
server/src/todos.rs      example domain: TodoTitle validates input at the boundary
server/src/error.rs      ApiError: the JSON body of every 4xx/5xx, part of the contract
server/src/auth.rs       sign-in: Argon2id, sessions, the CurrentUser extractor
server/src/events.rs     WebSocket /api/events: typed realtime events
server/migrations/       database schema (source of truth for tables)
server/tests/            integration tests, each gets a fresh database (#[sqlx::test])
web/app/routes.ts        page routes
web/app/api/             GENERATED client, never edit by hand
web/react-router.config.ts   rendering mode (ssr) and what is prerendered
web/app/seo.ts           public pages, canonical links and share cards
openapi.json             GENERATED contract, never edit by hand
scripts/check.ts         definition of done (bun run check)
Dockerfile, compose.yml  docker compose up -d runs everything
```

## How a change flows

1. Change the SQL in a migration, or add a query with `query!`.
2. Change the Rust handler and its `ToSchema` types. Then register the route in `api_router()`.
3. `bun run gen` regenerates the contract and the client.
4. Use the generated `<operationId>Options()` or `<operationId>Mutation()` in a route.
5. `bun run check`. If a layer disagrees with another, this is where it fails.

## Rendering

`web/react-router.config.ts` says which mode this project uses.

**`ssr: false` (default).** Paths in `prerender` (the public pages in `web/app/seo.ts`) are
rendered to HTML at build time, so search engines see their content. Every other route is a SPA behind the same server, and deep links work
because Axum falls back to the SPA shell. A prerendered page can use data that exists at build time
(see `/api-reference`), but cannot call the API while building.

**`ssr: true` (`bun create rr-stack my-app --ssr`).** Every route is rendered on the server by
`web/server.ts` and then hydrates. Axum stays the only public port: it answers `/api/*` and the files
in `web/build/client`, and forwards every other request to the renderer at `WEB_SSR_URL`. A route
gets its first-load data from a `loader` that calls the generated SDK with
`baseUrl: process.env.API_URL` and the visitor's cookie; `web/app/routes/todo.tsx` is the example,
so `/app/todos/:id` arrives as HTML with the todo and its title in it. `prerender` still works for
pages with no per-request data.

In both modes unknown `/api/*` paths return a JSON 404, never HTML.

## Search engines and share cards

Public pages are listed in `publicPages` in `web/app/seo.ts`. Each one is prerendered, listed in
`/sitemap.xml`, and gets a description, a canonical link and an Open Graph card with
`web/public/og.png` (replace it with your own 1200×630 image). `/robots.txt` points crawlers at the
sitemap. Playground pages, `/sign-in` and the 404 page carry `noindex`. With `--ssr` an unknown path
also answers with status 404; without it, the server cannot know which paths the SPA handles, so it
answers 200 and the 404 page adds `noindex` once it runs (what Google asks of single-page apps).

These URLs are absolute, so set `SITE_URL` (for example `https://example.com`) in `.env` before
building for production. `bun run build` reads it from there, and `docker compose` passes it into
the image build.

## UI components

`bun create rr-stack my-app --astryx` (or "Tailwind + Astryx" in the prompt) builds the playground
pages with [Astryx](https://github.com/meta/astryx), Meta's React design system (beta), layered under
Tailwind; the other pages stay plain Tailwind. Such an app has `bun run astryx` in `web/` for
component docs, and AGENTS.md says how to use it. Without the flag every page is plain Tailwind.

## Production

The `Dockerfile` builds one image with the server and the pages (with `--ssr`, also the renderer;
`compose.yml` runs it twice, as `app` and `web`). Run it with `DATABASE_URL` set;
it serves on port 3000 and runs migrations on startup. Session cookies are Secure by default; behind a
reverse proxy, set `TRUST_PROXY=true` so rate limits see the real client address. Without Docker: `bun run build` in `web/`,
`cargo build --release` in `server/`, then run `server/target/release/server` (`server.exe` on
Windows) with `WEB_DIST` pointing at `web/build/client`. With `--ssr`, also run `bun server.ts` in
`web/` and give the server `WEB_SSR_URL=http://127.0.0.1:3001`.

## Not included yet

File uploads, deploy recipes.

## License

MIT
