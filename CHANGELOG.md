# Changelog

Versions are the `create-rr-stack` package on npm. A version changes what new projects start
with; existing projects are not updated.

## 0.7.1 (2026-11-22)

- Signed out, moving between pages no longer makes the header's "Sign in" link vanish for a moment.
  A 401 from `/api/auth/me` used to be cached as an error, so every page asked again and showed
  nothing while it waited. "Signed out" is now cached as an answer, like a signed-in user.
- e2e: `settle()` now waits for the page's requests to finish after a client-side navigation too;
  Playwright's "networkidle" returned at once there, which is why no test caught the flicker. New
  tests: the Sign in link never leaves the header between pages, and signing out shows the
  signed-out page.

## 0.7.0 (2026-11-22)

- Deploy to Vercel as well as to your own server, with the same features. The app's Docker image
  runs on Vercel's Container Runtime with a Neon database; `DEPLOY.md` has the commands. Proven by
  running the whole browser test suite against Vercel production, for a default app and an `--ssr`
  app.
- Realtime updates go through Postgres `LISTEN/NOTIFY`, and the sign-in limit is counted in a
  `rate_limits` table (migration `0003`). Several server processes on one database now act as one:
  a change made through one reaches pages connected to another, and a client cannot get more
  sign-in attempts by landing on a different one. If the listener loses its connection, open pages
  reconnect and refetch.
- The server prefers `DATABASE_URL_UNPOOLED` when it is set, because a connection pooler drops
  `LISTEN` and the lock migrations take. `SIGN_IN_LIMIT` sets the attempts per minute (default 10).
- `--ssr` images run the server and the renderer together by default (`web/start.ts`), for hosts
  that run one container. `compose.yml` still runs them as two.
- `SITE_URL` can also come from a committed `web/.env.production`, for hosts that pass no variables
  to a build.
- `bun run e2e --url <address>` runs the browser tests against a deployment.
- A live demo at https://rrstack.vercel.app, an unmodified `--ssr` app, linked from the READMEs with
  a summary of what is measured: planted bugs caught by `e2e`, the suite passing on Vercel, and
  what CI runs. Its data is public and emptied daily by a workflow that new apps do not get.

## 0.6.0 (2026-11-22)

- Search engines and share cards. Public pages are listed once, in `web/app/seo.ts`: each is
  prerendered, listed in a generated `/sitemap.xml`, and gets a description, a canonical link and
  an Open Graph card (`web/public/og.png`, a Rust crab holding the React logo). `/robots.txt` points
  at the sitemap. Playground pages, `/sign-in` and the 404 page carry `noindex`. With `--ssr`, an
  unknown path answers 404 instead of 200.
- New `SITE_URL` setting in `.env` (read by `bun run build`, passed into the Docker build by
  `docker compose`): the public address these absolute URLs are built from.
- A prerendered page is served at its own URL (`/how-it-works`) instead of a 307 redirect to
  `/how-it-works/`, so canonical links and the sitemap name a page, not a redirect.
- Browser tests: `bun run e2e` builds the app, runs it, and drives a real Chromium through
  Playwright on bun (no Node). It opens every page cold, signs up, adds, completes, searches, edits
  and deletes a todo, checks that a second browser sees new todos live and cannot change someone
  else's, and fails on any JavaScript error, React hydration mismatch or 5xx response. Failing tests
  leave screenshots in `web/e2e/results/`. Chromium downloads on the first run. CI runs it on Linux
  and Windows and for `--ssr` and `--astryx` apps. AGENTS.md tells agents to run it after any page
  change.
- Production on one server: `compose.prod.yml` adds Caddy in front (HTTPS with automatic
  certificates, http redirected), requires `SITE_URL` and a real `POSTGRES_PASSWORD`, closes the
  app and database ports, and sets `TRUST_PROXY`. `DEPLOY.md` covers the first deploy, updates,
  backups, restores and what to check when it fails. `compose.yml` now takes the database password
  from `POSTGRES_PASSWORD` too, defaulting to the old value.
- Includes 0.5.1, which was not published on its own.

## 0.5.1 (2026-11-22)

- The CLI starts on bun 1.1 again, so it can tell you to run `bun upgrade`. Before, bun older
  than 1.2 crashed on the first line with `The value "bgCyan,black" is invalid`.
- The npm package no longer ships a stray local tool-state file (`astryx/files/web/app/.omc/`).
  A test now fails if the package holds any file git does not track.

## 0.5.0 (2026-11-21)

- New question in the CLI, "Which UI components?": Tailwind (default) or Tailwind + Astryx. With
  `--astryx` the playground pages (`/app`, `/app/todos`, `/app/todos/:id`, `/sign-in`) are built
  from [Astryx](https://github.com/meta/astryx), Meta's React design system (beta, pinned at
  0.7.17), layered under Tailwind so utilities still apply. Light and dark follow the system.
  Works with `--ssr`. The app gets `bun run astryx` for component docs and an AGENTS.md section.
- The template has two seams for this: `web/app/ui.css` (the styling base) and
  `web/app/components/ui-provider.tsx`. `cli/astryx/sync.ts` regenerates the Astryx
  `package.json`/`bun.lock` from the template's, and a test fails when they drift.
- CI scaffolds and checks a `--astryx` app on Linux and Windows, and builds a `--ssr --astryx` app
  with `docker compose up -d`.
- React Router runs on bun (`bun --bun react-router ...`), so Node is not needed at all and its
  "Node v20 detected" warning is gone. bun 1.4+ is required; `bun run dev`, `check` and `smoke`
  say `bun upgrade` when it is older, and the CLI warns up front.
- `bun run dev` starts the Rust server API-only (`WEB_DIST=""`); Vite serves the pages, so there is
  no "missing SPA shell" warning in `--ssr` projects. The Vite proxy follows `PORT` from `.env`.
- Server logs are quieter by default (`info,sqlx=warn`; `RUST_LOG` overrides).
- The CLI always shows the render mode, also when it came from `--ssr`, takes `--spa` to skip the
  question, and names the mode in the next steps.

## 0.4.0 (2026-11-21)

- `bun create rr-stack my-app --ssr` (or pick "Server rendering" in the prompt): every route renders
  on the server and hydrates. Axum stays the only public port and forwards page requests to a bun
  renderer (`web/server.ts`, `WEB_SSR_URL`); built files and `/api` never leave Rust. The todo page
  has a `loader` that calls the API with the visitor's cookie, so `/app/todos/:id` arrives as HTML
  with the todo and its `<title>`, and a missing todo is a real 404. `docker compose up -d` runs the
  server and the renderer from one image. `bun run dev` and `bun run smoke` handle both modes; CI
  scaffolds an SSR app and runs its check, smoke test and Docker build.
- The Rust server's page handling is `Pages::Spa` or `Pages::Ssr` (`server/src/pages.rs`), with tests
  for files, the SPA shell, forwarding (path, query, cookie, form posts), hop-by-hop headers, CONNECT,
  a 502 when the renderer is down and a 504 after 30 s. A malformed `WEB_SSR_URL` stops startup.
- Dates on server-rendered pages show the ISO day until the page mounts, then the visitor's format,
  so hydration works in every locale and time zone.
- The CLI shows its version and warns when npm has a newer one. bun and npx cache the package,
  so a plain `bun create rr-stack` could quietly run an old template; the warning gives the
  `bun create rr-stack@latest <name>` command. Offline or slow registry: no warning, no delay
  beyond 1.5 s. Honors `npm_config_registry` for mirrors.

## 0.3.2 (2026-11-21)

- `bun run dev` applies migrations before it compiles the server. A new database, or one left
  by an older project with the same name, failed with `relation "sessions" does not exist`.
  Without sqlx-cli it builds from `server/.sqlx` instead.
- `bun run dev` and `bun run check` find sqlx-cli through cargo, so it works when
  `~/.cargo/bin` is not on PATH.

## 0.3.1 (2026-11-21)

- The npm page's links to the translated READMEs, CONTRIBUTING and LICENSE open on GitHub
  instead of 404. A test keeps `README.md` free of relative links.

## 0.3.0 (2026-11-21)

- Sign-in: register, login, logout and `me`, with Argon2id password hashes and an HttpOnly,
  SameSite=Lax session cookie whose token is stored only as a SHA-256 hash. `CurrentUser` extractor
  for handlers. Todos have an owner; only the owner can change or delete them (403 otherwise).
- Hardening: sign-in and sign-up limited to 10 attempts per minute per address (typed 429 with
  Retry-After; `TRUST_PROXY` for X-Forwarded-For), at most 4 Argon2 hashes at once, cookies Secure
  by default, cross-site logout refused, security headers, non-root Docker image.
- Web unit tests (`bun test`) run in `bun run check`.
- Realtime: `GET /api/events` (WebSocket) pushes a typed `TodoEvent` on every change; the
  playground updates across tabs and shows a Live badge. The event type is in the contract.
- Repo: issue and PR templates, Dependabot, security policy, this changelog.

## 0.2.1

- README in English, Thai, Simplified Chinese and Japanese, with diagrams and a "why not wire it
  yourself" section. CONTRIBUTING.md.
- New projects get a project README and no longer receive the repo's contributor files.

## 0.2.0

- Windows and Linux: every command is a bun script (`bun run dev`, `check`, `smoke`, `gen`).
- `docker compose up -d` runs the whole app; each project gets its own database name and ports.
- A site about the stack in every new project: prerendered home, how it works and API reference,
  and a playground with full CRUD, URL filters, search, optimistic updates and a detail page.
- Every API error is a typed JSON `ApiError` (400, 404, 405, 422).
- Interactive CLI with prompts, spinners and `--yes`.

## 0.1.x

- First release: Axum + utoipa + SQLx, React Router with prerender, hey-api client, one `check`.
