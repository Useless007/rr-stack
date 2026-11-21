# Changelog

Versions are the `create-rr-stack` package on npm. A version changes what new projects start
with; existing projects are not updated.

## 0.5.0 (unreleased)

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
