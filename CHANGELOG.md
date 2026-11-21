# Changelog

Versions are the `create-rr-stack` package on npm. A version changes what new projects start
with; existing projects are not updated.

## 0.3.0 (unreleased)

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
