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
pnpm db:deploy           # applies the migrations (creates the tables)
pnpm db:seed             # fills the Quran tables and the kids track
pnpm start               # runs apps/telegram
```

`db:deploy` and `db:seed` are setup steps. Run them once per environment when
you first deploy and again only after a new migration. The bot refuses to
start until the text is seeded, so you cannot forget.

Set these env vars on the host (see the .env.example files):

- `DATABASE_URL`  the MySQL connection string
- `BOT_TOKEN`     from @BotFather
- `TZ_NAME`       default timezone for new subscribers, e.g. Africa/Cairo
- `ADMIN_TELEGRAM_ID`  optional, unlocks /admin_* for you
- `NODE_ENV=production`

## With Docker

A `Dockerfile` is included. It runs the bot from source with tsx and includes
the committed Quran text, so the image needs no network to seed.

```bash
docker build -t ayah-bot .
# Run migrations and seed once (only needed on first deploy / new migration):
docker run --rm --env-file apps/telegram/.env ayah-bot pnpm db:deploy
docker run --rm --env-file apps/telegram/.env ayah-bot pnpm db:seed
# Then run the bot:
docker run -d --env-file apps/telegram/.env -p 8080:8080 ayah-bot
```

If you run more than one instance, run the migrate and seed steps as a single
one-off job, not inside each container.

## Notes for shared hosting MySQL

The database client is tuned for shared hosting (like Hostinger) that closes
idle connections quickly. It uses a small pool with a short idle timeout. See
`packages/database/src/client.ts`. This is also fine on a normal MySQL.

## Health check

Point your host's health check at `GET /health` on the port from `PORT`
(default 8080). It returns 200 with a small JSON body while the bot is alive.

## Restarts are safe

On start the bot runs a catch-up delivery, so if it was down at someone's
send time, today's ayah still goes out (once). The per-day idempotency record
makes sure a restart never double-sends.

## Updating the bot

```bash
git pull
pnpm install
pnpm db:deploy     # apply any new migrations
pnpm start
```

You do not need to re-run `data:fetch` or `db:seed` on a normal update. The
Quran data does not change.
