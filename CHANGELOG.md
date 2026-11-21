# Changelog

Versions are the `create-rr-stack` package on npm. A version changes what new projects start
with; existing projects are not updated.

## 0.3.0 (unreleased)

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
