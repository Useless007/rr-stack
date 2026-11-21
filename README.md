<h1>RR stack</h1>

<p>
  <a href="https://www.npmjs.com/package/create-rr-stack"><img alt="npm" src="https://img.shields.io/npm/v/create-rr-stack?color=3fb6a8"></a>
  <a href="https://github.com/Useless007/rr-stack/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Useless007/rr-stack/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/Useless007/rr-stack/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0e1a2b"></a>
</p>

**English** · [ไทย](https://github.com/Useless007/rr-stack/blob/main/README.th.md) · [简体中文](https://github.com/Useless007/rr-stack/blob/main/README.zh-CN.md) · [日本語](https://github.com/Useless007/rr-stack/blob/main/README.ja.md)

React Router + Rust (Axum), typed from the database to the screen.

```bash
bun create rr-stack my-app
```

RR stack is a starter for apps that AI agents write and people review. One command,
`bun run check`, answers "is it done?". If it exits 0, the SQL, the Rust API, the OpenAPI
contract and the React code agree with each other. It runs the same on Windows, macOS and Linux.

## Why

Most bugs an AI agent ships are two layers disagreeing: a renamed column, a field the client still
sends, an error shape nobody handles. RR stack moves each of those to compile time:

| Layer | Tool | Checked by |
|---|---|---|
| Database | Postgres + SQLx `query!` | the Rust compiler, against the real schema |
| API | Axum + utoipa | `openapi.json` is derived from the handlers |
| Contract | `openapi.json` | regenerated and diffed on every `bun run check` |
| Client | hey-api + TanStack Query | generated from the contract, including typed errors |
| UI | React Router (`prerender` + SPA, or `ssr: true` with `--ssr`) | `tsc` and a full build |

By default production is one process: Axum serves the API and the built pages, no Node at runtime.
`bun create rr-stack my-app --ssr` renders every page on the server instead, with one added bun
process behind Axum.

## How it works

![How a change travels from the database to the screen, and where bun run check verifies it](https://raw.githubusercontent.com/Useless007/rr-stack/main/docs/assets/change-flow.svg)

![At runtime one Rust binary serves the API and the pages](https://raw.githubusercontent.com/Useless007/rr-stack/main/docs/assets/runtime.svg)

## Why not wire it yourself?

You can. Every piece is a normal, popular library. What takes the time is the glue between them,
and the glue is what this repo is:

| You would need to | RR stack ships |
|---|---|
| Export an OpenAPI spec from Rust without starting the server | `cargo run --bin openapi`, built from the same router the server runs |
| Generate a TS client and react-query hooks, and fail CI when they drift | `bun run gen`, plus a contract diff in `bun run check` |
| Build Rust in CI and Docker without a database | committed `.sqlx/` offline query metadata |
| Return typed JSON for bad input and unknown routes, not plain text | `AppJson`, `AppPath`, `AppQuery` and JSON 404/405 |
| Serve prerendered pages, a SPA and the API from one binary | Axum with a SPA fallback; deep links are tested |
| Use the same commands on Windows and Linux | bun scripts, LF line endings, CI on both |
| Tell an AI agent what "done" means and what not to touch | `AGENTS.md` and one check command |
| Sign-in that is safe by default | Argon2id hashes, HttpOnly SameSite cookie, hashed session tokens, owner checks in SQL |
| Push changes to open pages | a WebSocket whose message type is in the contract, so the client is typed |
| Start everything with one command | `bun run dev`, or `docker compose up -d` |

Each row costs a few hours of docs and trial and error the first time, and is easy to get subtly
wrong: a client that CI never regenerates, a fallback that answers `/api/typo` with HTML. Here each
one has a test.

**Going further.**

- Search engines need a page? Add its path to `prerender` in `web/react-router.config.ts` and it
  ships as static HTML. Pages with per-visitor data in their first HTML: create the app with
  `--ssr`, and a route's `loader` runs on the server (the todo page is the example).
- Already have a backend in another language? The web half only reads `openapi.json`, so any
  backend that publishes an OpenAPI spec can drive the same generated client and hooks.
- New to Rust? The agent writes it and the compiler tells the agent exactly what to fix.
  `bun run check` tells you when it is done.

## Quick start

```bash
bun create rr-stack my-app
cd my-app
docker compose up -d     # the whole app, no toolchain needed; the CLI prints the URL
# or, to develop:
bun run dev              # Postgres in Docker + Rust API + Vite, with hot reload
```

A new project is a small working site about the stack: prerendered pages, an API reference built
from the contract, sign-in, and a playground with full CRUD, filters, search, optimistic updates,
live updates over a WebSocket and typed 401/403/404/422 errors. Read its `README.md` and `AGENTS.md` for the day-to-day workflow.

Requirements: Docker. To develop, also Rust (stable), [bun](https://bun.sh) 1.4+, git and
`cargo install sqlx-cli --no-default-features --features postgres,rustls`.

## This repository

This repo is two things at once:

- **The template.** Everything outside `cli/` and `docs/` is a working RR stack project. It is what
  `bun create rr-stack` copies, so you can run, test and change it like any generated project.
- **The CLI.** `cli/` is the `create-rr-stack` package on npm. At publish time it bundles the
  template (only files git tracks) and the project README from `cli/project-readme.md`.

```
server/                Rust API (Axum, utoipa, SQLx) and its integration tests
web/                   React Router app; web/app/api/ is generated
scripts/               bun scripts behind bun run dev / check / smoke / gen
cli/                   create-rr-stack: index.ts (prompts), scaffold.ts (copy + rename), tests
openapi.json           generated contract
.github/workflows/     CI on Linux and Windows, plus docker compose; copied into new projects
```

## Contributing

Contributions are welcome, from people and from agents working for them. Start with
[CONTRIBUTING.md](https://github.com/Useless007/rr-stack/blob/main/CONTRIBUTING.md). The short version:

1. Open an issue first for anything bigger than a fix, so we agree on the shape.
2. `bun run check` must exit 0. CI runs it on Linux and Windows.
3. Changing the template? Also run `bun test` in `cli/`; it scaffolds a project and checks it.
4. Keep the README translations in step with this file, or say in the PR which ones need an update.

## License

[MIT](https://github.com/Useless007/rr-stack/blob/main/LICENSE)
