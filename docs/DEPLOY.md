# Deploy

The bot is a single long-running Node process plus a MySQL/MariaDB database.
It uses Telegram long-polling, so it does not need a public URL. There is a
small `/health` endpoint for uptime checks.

## What you need

- A MySQL or MariaDB database.
- A Telegram bot token from @BotFather.
- A host that runs a Node 20+ process and restarts it on crash (Fly.io, a
  small VPS with systemd or pm2, a container platform, etc.).

## First deploy

```bash
pnpm install --prod=false
pnpm data:fetch          # writes the frozen Quran data file (skip if cloned)
pnpm data:fetch:tafseer  # writes the frozen tafseer data file (skip if cloned)
pnpm db:deploy           # applies the migrations (creates the tables)
pnpm db:seed             # fills the Quran tables (text + tafseer) and BOTH tracks
pnpm start               # runs the bot (src/index.ts)
```

`db:deploy` and `db:seed` are setup steps. Run them once per environment when
you first deploy, and again after a new migration **or when a new track/order
is added**. The bot refuses to start until the text and every offered order
are seeded, so you cannot forget.

`db:seed` is idempotent and per-track: it skips work already done and only
fills in what is missing. So adding a new order (a new `Track`) ships by
re-running `pnpm db:seed`. No migration is needed, because tracks are data.

Set these env vars on the host (see the single root `.env.example`):

- `DATABASE_URL`  the MySQL connection string
- `BOT_TOKEN`     from @BotFather
- `TZ_NAME`       default timezone for new subscribers, e.g. Africa/Cairo
- `ADMIN_TELEGRAM_ID`  optional, unlocks the admin commands for you
- `NODE_ENV`  defaults to `production` in `.env.example` and in the Docker
  image, so you usually do not need to touch it. (`pnpm dev` always runs in
  development mode regardless, for local work.)

## Admin commands

With `ADMIN_TELEGRAM_ID` set, message the bot privately (these are never shown
in the public command menu, and only your id may run them):

- `/admin_health`  uptime and current time, a quick "is it up?".
- `/admin_send`  fire the delivery batch by hand (the exact path the cron
  uses); a smoke test right after a deploy.
- `/admin_preview <surah> <ayah> [review]`  render exactly what the bot would
  send for a given ayah, into your DM, without touching any subscriber. The
  ayah defaults to 1 and the review window to 3. Example: `/admin_preview 2
  255 3` shows Ayat al-Kursi with three review ayat above it.

## With Docker

A `Dockerfile` is included. It runs the bot from source with tsx and includes
the committed Quran text, so the image needs no network to seed.

```bash
docker build -t ayah-bot .
# Run migrations and seed once (only needed on first deploy / new migration):
docker run --rm --env-file .env ayah-bot pnpm db:deploy
docker run --rm --env-file .env ayah-bot pnpm db:seed
# Then run the bot:
docker run -d --env-file .env -p 8080:8080 ayah-bot
```

If you run more than one instance, run the migrate and seed steps as a single
one-off job, not inside each container.

### Production (shared Compose)

On the server the bot runs under one shared Compose project at `/opt/bots`,
connected to a shared MariaDB (`shared-db`). Copy the two services from
`docs/compose.example.yml` (`ayah` and the one-off `ayah-migrate`) into
`/opt/bots/docker-compose.yml`, and set `DATABASE_URL` in the server-side
`/opt/bots/telegram/ayah/.env` to use the `shared-db` service name as host:
`mysql://<user>:<password>@shared-db:3306/ayah`.

Pushes are gated: the `deploy` workflow runs `pnpm check` (typecheck + lint +
tests) first and only deploys if it passes, and `set -e` aborts the deploy if
the migrate step fails, so a broken build or schema never reaches production.

## Notes for shared hosting MySQL

The database client is tuned for shared hosting (like Hostinger) that closes
idle connections quickly. It uses a small pool with a short idle timeout. See
`src/database/client.ts`. This is also fine on a normal MySQL.

## Health check

Point your host's health check at `GET /health` on the port from `PORT`
(default 8080). It returns 200 with a small JSON body while the bot is alive.
The Docker image also defines a `HEALTHCHECK` against the same endpoint, so
`docker ps` and the orchestrator can tell a wedged bot from a healthy one.

## Restarts are safe

On start the bot runs a catch-up delivery, so if it was down at someone's
send time, today's ayah still goes out (once). The per-day idempotency record
makes sure a restart never double-sends.

## Updating the bot

```bash
git pull
pnpm install
pnpm db:deploy     # apply any new migrations
pnpm db:seed       # if the release adds a new order/track, or backfills data
pnpm start
```

You do not need to re-run `data:fetch` on a normal update (the Quran data does
not change). Re-run `db:seed` when a release adds a new order/track; it is
idempotent, so running it when nothing is new is a harmless no-op. The release
that added the Mushaf (forward) order needs one `pnpm db:seed`.

The release that added the **tafseer** needs `pnpm db:deploy` (the migration
adds the `ayat.tafseer` and `subscribers.tafseer_enabled` columns) and one
`pnpm db:seed` (it backfills the tafseer for the already-seeded ayat from the
committed `tafseer-muyassar.json`). Both are idempotent.
