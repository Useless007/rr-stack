# Contributing to RR stack

Thanks for helping. This file is for people and for AI agents working on this repository. If you
are an agent, also follow `AGENTS.md`: its rules apply here too.

## Set up

You need Rust (stable), [bun](https://bun.sh), Docker, git and
`cargo install sqlx-cli --no-default-features --features postgres,rustls`.

```bash
git clone https://github.com/Useless007/rr-stack.git
cd rr-stack
cp .env.example .env
(cd web && bun install) && (cd cli && bun install)
docker compose up -d --wait db
bun run check        # expect "check OK" on the last line
```

On Windows, run the same commands in PowerShell, Git Bash or WSL. Every project command is a bun
script, so there is nothing bash-only to install.

## How the repo fits together

The repository root is a complete RR stack project (the template). `cli/` is the
`create-rr-stack` npm package that copies it. A change to the template changes every project
created after the next release, so treat files outside `cli/` as public API.

| You change | Also do |
|---|---|
| A Rust handler or a type that crosses the wire | `bun run gen` and commit `openapi.json` and `web/app/api/` |
| SQL in a `query!` | `cargo sqlx prepare -- --all-targets` in `server/`, commit `server/.sqlx/` |
| How pages or files are served | `bun run smoke` |
| A file the CLI renames (`compose.yml`, `.env.example`, `Cargo.toml`, `package.json`) | `bun test` in `cli/`; `scaffold.ts` fails loudly if a string it replaces has moved |
| `cli/project-readme.md` | it becomes the README of every new project |
| `README.md` | update the translations, or list the stale ones in the PR |

## Before you open a pull request

- `bun run check` exits 0. It runs rustfmt, clippy (no `unwrap` outside tests), the contract
  diff, typecheck, the web build, the `.sqlx` check, the Rust tests and the CLI tests.
- New behaviour has a test that fails without your change. Rust tests live in `server/tests/`
  and get a fresh database from `#[sqlx::test]`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `chore:`.
- The PR says why, what changed for someone using the template, and how you verified it.

CI runs the same checks on Linux and Windows, scaffolds a project with the CLI, and starts the
app with `docker compose up -d`. A PR merges when CI is green and a maintainer has reviewed it.

## Translations

`README.md` (English) is the source of truth. Translations live next to it as
`README.<language>.md`. Fixes to wording and new languages are welcome. Keep code, commands and
file names exactly as in English.

## Reporting bugs

Open an issue with your OS, `bun --version`, `rustc --version`, the command you ran and its full
output. For a bug in a generated project, say which `create-rr-stack` version created it.

## Releases

Maintainers release from `main`: bump `version` in `cli/package.json`, tag `vX.Y.Z`, and
`npm publish` in `cli/`. The `prepack` script bundles the template.
