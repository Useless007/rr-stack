# Move an existing app onto RR stack

This guide is for an app that already runs in production: real users, a database with data in it,
maybe devices or workers that post to it. It describes how Clima moved from Next.js, a Node API and
Node workers to RR stack in one cutover, and the checks that let it switch without anyone logging in
again or losing a row.

The rule behind every step: **the outside of the app stays the same**. URLs, JSON field names, status
codes, error messages, the database schema, cookies and password hashes do not change on the day of
the switch. Only what produces them does. Improve them afterwards, one PR at a time, on a system
that already works.

## 1. One branch, one cutover

Do the move on one branch and switch everything at once. Running the old and new servers side by
side, with a proxy splitting routes between them, sounds safer but doubles what can break: two
session stores, two copies of each rule, and a proxy config that is only right on one day. A single
cutover is easier to rehearse (step 7) and easier to roll back (deploy the previous image).

Inside the branch, port in the order things depend on each other, each step with its tests passing
before the next: schema, auth, the core domain, the rest of the API, workers, pages, and only then
deploy config and docs.

## 2. Bring the scaffold into the repo

Generate a project somewhere else, then copy it in:

```sh
bunx create-rr-stack@<version> tmp-app --yes --no-install --no-git
```

- Copy `server/`, `web/`, `scripts/`, `openapi.json` and `AGENTS.md`. Leave the scaffold's compose,
  Caddy and Dockerfile for later: the app's own deploy files change in the cutover commit, not
  before.
- Delete the demo domain (todos, events, the playground pages and their tests) before writing your
  own code, so nothing depends on it.
- The template's `.gitattributes` sets `eol=lf` for every file. In a repo that already has CRLF
  files (a Windows teammate, a Windows-only tool), scope it to the new folders, then run
  `git add --renormalize . && git status --short` and check only new files appear.
- Pin the generator version you used in the first commit message, so the starting point can be
  regenerated.

## 3. A baseline migration that changes nothing

The first migration describes the schema the database **already has**:

- Take it from the code that created the schema today, or from `pg_dump --schema-only`.
- Write it with `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT
  EXISTS`, so it runs on the production database without touching it.
- Leave out one-off data fixes the old code ran at startup. A migration runs once; a fix that
  rewrites rows would run on data that has changed since it was written.
- Prove it, outside CI, before relying on it:
  1. On one scratch database, build the schema the old way. On another, run `cargo sqlx migrate run`.
     `pg_dump --schema-only` both and diff them, ignoring `_sqlx_migrations`. There should be no
     difference.
  2. Fill the first one with realistic data, run the migrations on it, and compare row counts per
     table before and after.
- Never edit the baseline after the cutover. Every change after it is a new migration.

## 4. Keep the wire contract: write the old behaviour down as tests first

For each route, before porting it, write an integration test (`server/tests/`, `#[sqlx::test]`)
from what the old code does:

- the same path and method, status codes, JSON field names, and the error text a user can see;
- who may call it (signed out, a normal user, an admin) and what each gets;
- the odd cases the old code handled: empty bodies, oversize input, a trailing slash, a number
  sent as a string.

Port the route until the test passes. If the old behaviour was wrong, port it as it was, then fix it
in a later PR with its own test. Mixing "port" and "fix" in one change makes a broken cutover hard
to read.

Generated types replace hand-written ones in the web app, so once `bun run gen` has run, the
compiler lists every page that used a field the contract no longer has.

## 5. Nobody logs in again

Users notice a forced sign-out more than any other change. Check before the cutover:

- **Passwords:** the old hashes verify in Rust. Port the hashing scheme exactly (algorithm, cost,
  salt format, key length), and add a test with a hash the old code wrote.
- **Sessions:** a cookie issued by the old server still works on the new one. Same cookie name
  (`__Host-` prefix included), the same way the token is stored (raw or hashed), the same idle and
  absolute limits.
- **Machine credentials:** device keys, API tokens and encrypted secrets the old code stored are
  read the same way, so devices in the field keep posting and integrations keep working.

## 6. Workers are binaries in the same image

Background jobs (a queue consumer, a notifier, a scheduler) become extra binaries in
`server/src/bin/`, built into the same image and started by compose with a different `command`.
They share the crate's code and its tests. Give each worker only the environment variables it reads,
and only the network access it needs. A notifier that cannot reach the internet can still report
healthy, so its healthcheck should prove it can reach what it sends to.

## 7. Rehearse the cutover on a copy of production

Run the real switch once on scratch ports before doing it for real:

1. Start the old stack from the current `main` on fresh volumes, and create real-looking data
   through the app itself: sign in, create records, let a device post, let a worker run.
2. Stop it, check out the migration branch, and start the new stack **on the same volumes**:
   `docker compose up -d --build --remove-orphans`. Without `--remove-orphans`, old services that no
   longer exist in compose keep running and keep doing their jobs.
3. Check, in a real browser and with `curl`:
   - the old session cookie still works;
   - the old password signs in;
   - an old device credential still posts;
   - every page opens with the old data;
   - a backup made now can be downloaded and restored.
4. Write the steps you ran into the deploy doc. That list is the runbook for the real switch.

Back up first on the real day, and never use `docker compose down -v`.

## 8. After the cutover

- Run `bun run e2e --url <your site>` against production.
- Watch the logs for 4xx and 5xx that did not happen before: they are the contract differences the
  tests missed. Each gets a test, then a fix.
- Only now start changing the outside: new endpoints, renamed fields, a new schema. Each change is
  a normal RR stack PR with its own migration and tests.
