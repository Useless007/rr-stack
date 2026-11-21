# Deploy

Two ways, with the same features: your own server ([VPS with Docker](#vps-with-docker)), or
[Vercel](#vercel) with a Neon database. Either way, `bun run e2e --url <address>` afterwards runs
the browser tests against what you deployed.

## VPS with Docker

One Linux server with Docker runs everything: Postgres, the app, and Caddy in front with HTTPS.
Only ports 80 and 443 are reachable from outside.

```
browser ──https──> Caddy (80, 443) ──> app (Rust: API + pages) ──> Postgres
                                        └─> web (page renderer, --ssr apps only)
```

### What you need

- A server with Docker Engine and Docker Compose 2.24 or newer (`docker compose version`). Building
  the Rust server takes more memory than running it: on a 1 GB server, add swap first.
- A domain whose DNS `A` (and `AAAA`, if the server has IPv6) record points at the server.
- Ports 80 and 443 open in the server's firewall. Caddy needs both to get its certificate.

### First deploy

On the server:

```sh
git clone <your repository> app && cd app
cp .env.example .env
```

Add these lines to `.env`:

```sh
SITE_URL=https://example.com
POSTGRES_PASSWORD=<output of: openssl rand -hex 24>
COMPOSE_FILE=compose.yml:compose.prod.yml
```

- `SITE_URL` is your domain with `https://` and no `/` at the end. Caddy requests the certificate for it, and the pages are
  built with it (canonical links, share cards, `sitemap.xml`).
- `POSTGRES_PASSWORD` is set once, when the database volume is created. Use letters and digits only:
  it goes into a connection URL. Changing it later does not change the database's password.
- `COMPOSE_FILE` makes every `docker compose` command use the production file too, so you can type
  `docker compose ...` instead of `docker compose -f compose.yml -f compose.prod.yml ...`.

Then start it:

```sh
docker compose up -d --build --wait
curl https://example.com/api/health    # {"status":"ok"}
```

The first build compiles the Rust server and takes a few minutes. Migrations run when the server
starts.

### What compose.prod.yml changes

| | `docker compose up -d` (local) | with `compose.prod.yml` |
|---|---|---|
| Address | http://localhost:8000 | `SITE_URL`, HTTPS, http redirects to https |
| Postgres password | the user name | `POSTGRES_PASSWORD`, required |
| Ports open | app and Postgres on 127.0.0.1 | only 80 and 443, on Caddy |
| `TRUST_PROXY` | false | true: sign-in rate limits see the visitor's address from Caddy |
| Session cookie | Secure | Secure |

### Update

```sh
git pull
docker compose up -d --build --wait
```

Back up first (below). New migrations run on start, each in its own transaction: one that fails
leaves the database as it was before it, and the server exits and keeps restarting, so the site is
down until you fix it. `docker compose logs app` says why. Going back to an older version after a
newer migration ran does not work either: the server refuses to start with migrations it does not
know. Restore the backup instead.

### Back up and restore

```sh
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup-$(date +%F).sql
```

Restoring replaces everything in the database with the backup:

```sh
docker compose stop app
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup-2026-01-31.sql
docker compose start app
```

Copy backups off the server: a backup on the same disk is lost with the disk. To run one every
night at 03:00, add this to the server's crontab (`crontab -e`), with your own paths. Cron reads `%`
as a line break, hence `\%`, and it must `cd` into the project to see `.env`:

```sh
0 3 * * * cd /srv/app && docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > /srv/backups/backup-$(date +\%F).sql
```

Never run `docker compose down -v` on the server: `-v` deletes the database volume and Caddy's
certificates.

### When something is wrong

| You see | Look at |
|---|---|
| The browser cannot connect | DNS points at this server; ports 80 and 443 are open; `docker compose ps` |
| A certificate error | `docker compose logs caddy`: usually DNS not pointing here yet, or port 80 closed |
| Signed in, but the next page is signed out | `SITE_URL` starts with `https://`; you are on the same domain |
| 502 from Caddy | `docker compose logs app` (and `web` in a `--ssr` app) |
| Pages link to localhost | `SITE_URL` was not set when the image was built: set it, then `docker compose up -d --build` |

## Vercel

Vercel runs the app's Docker image (its Container Runtime, in beta) and gives it HTTPS, the domain
and scaling. The database is Neon, added from the Vercel Marketplace. Every feature works there,
including realtime updates and the sign-in limit: both go through Postgres, so the instances Vercel
starts work as one. Apps created with `--ssr` run the renderer and the server in that one container.

With the Vercel CLI (`bunx vercel@latest`), in the project folder:

```sh
vercel link                                  # create or pick the Vercel project
vercel integration add neon                  # a database; sets DATABASE_URL and DATABASE_URL_UNPOOLED
printf 3000 | vercel env add PORT production       # the port the image listens on
printf true | vercel env add TRUST_PROXY production
echo "SITE_URL=https://your-app.vercel.app" > web/.env.production   # then commit it
vercel deploy --prod
bun run e2e --url https://your-app.vercel.app
```

- `SITE_URL` goes in `web/.env.production`, a committed file, because Vercel passes no variables to
  a Docker build. It is the public address, not a secret. Change it when you add your own domain.
- The server uses `DATABASE_URL_UNPOOLED` when it is set. Neon's default `DATABASE_URL` goes through
  a connection pooler, which drops the `LISTEN` that realtime updates need.
- `bun run e2e --url` signs up four users and adds todos. Point it at a deployment whose data you do
  not mind, or delete them afterwards. The sign-in limit (10 a minute per address) allows two runs a
  minute from one machine.
- Without `TRUST_PROXY=true`, every visitor looks like Vercel's own address to the sign-in limit, so
  the whole site would share 10 attempts a minute.
- Each instance opens up to 10 database connections. If Neon reports too many connections, set
  `DATABASE_POOL_MAX` lower (for example 3).
- `.vercelignore` keeps `.env` out of the upload. Keep secrets in `vercel env`, never in a file.

### What is different from a VPS

| | Vercel | VPS |
|---|---|---|
| A visit after 5 idle minutes | waits for the container to start (a second or two) | instant |
| Open realtime connections | closed after 300 s on the Hobby plan (800 s on Pro); pages reconnect and refetch on their own | stay open |
| Request and response bodies | at most 4.5 MB | no limit |
| Backups | Neon keeps history you can restore from its dashboard | `pg_dump`, above |
| Updates | `vercel deploy --prod`, or push to the connected Git repository | `git pull` and `docker compose up -d --build` |
