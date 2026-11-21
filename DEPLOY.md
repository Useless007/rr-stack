# Deploy

One Linux server with Docker runs everything: Postgres, the app, and Caddy in front with HTTPS.
Only ports 80 and 443 are reachable from outside.

```
browser ──https──> Caddy (80, 443) ──> app (Rust: API + pages) ──> Postgres
                                        └─> web (page renderer, --ssr apps only)
```

## What you need

- A server with Docker Engine and Docker Compose 2.24 or newer (`docker compose version`). Building
  the Rust server takes more memory than running it: on a 1 GB server, add swap first.
- A domain whose DNS `A` (and `AAAA`, if the server has IPv6) record points at the server.
- Ports 80 and 443 open in the server's firewall. Caddy needs both to get its certificate.

## First deploy

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

## What compose.prod.yml changes

| | `docker compose up -d` (local) | with `compose.prod.yml` |
|---|---|---|
| Address | http://localhost:8000 | `SITE_URL`, HTTPS, http redirects to https |
| Postgres password | the user name | `POSTGRES_PASSWORD`, required |
| Ports open | app and Postgres on 127.0.0.1 | only 80 and 443, on Caddy |
| `TRUST_PROXY` | false | true: sign-in rate limits see the visitor's address from Caddy |
| Session cookie | Secure | Secure |

## Update

```sh
git pull
docker compose up -d --build --wait
```

Back up first (below). New migrations run on start, each in its own transaction: one that fails
leaves the database as it was before it, and the server exits and keeps restarting, so the site is
down until you fix it. `docker compose logs app` says why. Going back to an older version after a
newer migration ran does not work either: the server refuses to start with migrations it does not
know. Restore the backup instead.

## Back up and restore

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

## When something is wrong

| You see | Look at |
|---|---|
| The browser cannot connect | DNS points at this server; ports 80 and 443 are open; `docker compose ps` |
| A certificate error | `docker compose logs caddy`: usually DNS not pointing here yet, or port 80 closed |
| Signed in, but the next page is signed out | `SITE_URL` starts with `https://`; you are on the same domain |
| 502 from Caddy | `docker compose logs app` (and `web` in a `--ssr` app) |
| Pages link to localhost | `SITE_URL` was not set when the image was built: set it, then `docker compose up -d --build` |
