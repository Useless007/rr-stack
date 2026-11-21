# Working in this repo

React (React Router, `web/`) + Rust (Axum, `server/`), typed end to end through `openapi.json`.

## Definition of done

- Run `bun run check` and read its output. Exit 0 is the only "done".
- Changed how the server serves pages or files? Also run `bun run smoke`.
- Changed anything under `web/app`? Also run `bun run e2e`: a real browser opens every page and
  walks the todo flow, and fails on any JavaScript error, hydration mismatch or 5xx. A failing test
  saves screenshots in `web/e2e/results/`: look at them before changing code.
- New page: add its path to `web/e2e/pages.test.ts`. New user flow: add a test in `web/e2e/` that
  finds elements by role and label (`getByRole`, `getByLabel`), never by CSS class. Use `unique()`
  for data, since runs share the dev database, and wait for the API's answer before a reload.
- Do not claim success from "it compiles" or from reading the diff.

## Never edit these by hand

They are generated. `bun run check` fails if they differ from a fresh generation.

- `openapi.json` — from the Rust handlers (`cargo run --bin openapi`)
- `web/app/api/**` — from `openapi.json` (`bun run gen` regenerates both)
- `server/.sqlx/**` — from the SQL in `query!` macros (`cargo sqlx prepare -- --all-targets`, run in `server/`)

## Where each type comes from

| Layer | Source of truth |
|---|---|
| Database | `server/migrations/*.sql` |
| Wire (JSON) | Rust structs deriving `ToSchema` in `server/src/` |
| TypeScript | `~/api` only. Never hand-write a type that crosses the wire. |

## Add an endpoint

1. Write the handler with `#[utoipa::path(..., operation_id = "camelCaseName")]` in `server/src/<domain>.rs`.
2. Register it in `api_router()` in `server/src/lib.rs` with `routes!`.
3. Add an integration test in `server/tests/` (`#[sqlx::test]` gives a fresh database).
4. `bun run gen`, then use the generated `<name>Options()` / `<name>Mutation()` from `~/api/@tanstack/react-query.gen`.
5. New SQL? `cargo sqlx prepare -- --all-targets` and commit `.sqlx/`.

## Rules

- Validate at the boundary with a newtype (see `TodoTitle`): parse once, trust the type inside.
  `#[schema(max_length = ...)]` only documents; it does not enforce.
- No `unwrap`/`expect` outside tests (clippy denies it). Return `AppError`; it becomes a JSON
  `ApiError` that the generated client types. Use `AppJson`, `AppPath`, `AppQuery` (not axum's
  extractors) so bad input is a typed 400/422 instead of plain text.
- Need the signed-in user? Add `CurrentUser(user): CurrentUser` to the handler; it answers 401 by
  itself. Check ownership in the SQL (`WHERE ... AND owner_id = $n`), not after loading the row.
  Never log or return `password_hash`, and never store a raw session token.
- Realtime: send a `TodoEvent` (or a new event enum registered in `ExtraSchemas`) on
  `state.events`; open pages receive it over `/api/events`.
- Keep Rust plain: no custom macros, no generic abstraction layers. A human must be able to
  debug it when you get stuck.
- Rendering is set in `web/react-router.config.ts`. With `ssr: false` (the default), paths in
  `prerender` become HTML at build time and every other route is SPA. With `ssr: true` (apps created with `--ssr`), every route renders
  on the server in `web/server.ts`. Give a page its first-load data with a `loader` that calls the
  generated SDK with `baseUrl: process.env.API_URL` and the request's `cookie` header (see
  `web/app/routes/todo.tsx` in such an app).
- SEO lives in `web/app/seo.ts`. A public page that search engines must find: add its path to
  `publicPages` (that prerenders it and lists it in `/sitemap.xml`) and return
  `seo({ title, description, path })` from its `meta`. A page behind sign-in or with private data
  gets `noindex` in its `meta` (pages under `routes/playground-layout.tsx` already have it).
  Absolute URLs come from `SITE_URL` at build time; never hard-code the domain.
- New migration: a new numbered file. Never edit one that is committed.
- Scripts in `scripts/` are TypeScript run by bun so they work on Windows, macOS and Linux.
  Do not add bash-only scripts or commands.
