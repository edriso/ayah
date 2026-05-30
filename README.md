# Ayah

A Telegram bot that helps people memorize the Quran. It sends one ayah a
day to each subscriber, together with the last ten ayat of the same surah
for review. Each person picks the days and the time they want, and can take
a break whenever they need to.

The bot text is in Arabic. The code and docs are in English so any
developer can work on it.

## How it works (in one minute)

- Every subscriber follows a track. The default track is `kids-hifz`, which
  walks the Quran from An-Nas (114) back to Al-Fatihah (1). Inside each
  surah the ayat go in normal order (1, 2, 3 ...). This is the order many
  teachers use with children because the short surahs come first.
- A subscriber has a position in the track. Each day they receive the ayah
  at their position, plus a review block of the last ten ayat in that surah.
  Then their position moves forward by one.
- The Quran text is verified Tanzil Uthmani text. It lives in read-only
  database tables and is never changed by the bot. See `docs/DATABASE.md`.

## Project layout

This is a small pnpm workspace with three parts:

```
packages/core       Pure logic, no database and no network. Easy to test.
packages/database   Prisma schema, the database client, and services.
apps/telegram       The grammY bot: commands and the daily scheduler.
```

The split means the brain (`core`) is written and tested once, the database
package owns all data access, and the app is a thin Telegram adapter. A
future Discord app would reuse `core` and `database` without changes.

## Requirements

- Node.js 20 or newer
- pnpm 10 or newer
- A MySQL or MariaDB database

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Create the env files and fill them in
cp packages/database/.env.example packages/database/.env
cp apps/telegram/.env.example      apps/telegram/.env
#    - set DATABASE_URL in both
#    - set BOT_TOKEN in apps/telegram/.env (from @BotFather)

# 3. Download and verify the Quran text (writes a frozen data file)
pnpm data:fetch

# 4. Create the tables
pnpm db:push

# 5. Seed surahs, ayat, and the kids track
pnpm db:seed

# 6. Run the bot
pnpm dev
```

If `pnpm data:fetch` cannot reach Tanzil, set `QURAN_SOURCE_URL` to a Tanzil
"Text (with aya numbers)" download of the Uthmani text and run it again. The
script checks what it downloads (6236 ayat, correct count per surah) and
refuses to write anything that does not match.

## Commands the user sees (Arabic)

- `/today` show the current ayah now (does not move your position)
- `/time HH:MM` set the daily send time
- `/days` pick which weekdays you receive ayat
- `/timezone Area/City` set your timezone
- `/break` take a break (stops sending, keeps your position)
- `/resume` come back from a break
- `/settings` show your current settings
- `/help` help

## Useful scripts

```bash
pnpm dev          # run the bot with reload
pnpm test         # run all tests
pnpm check        # typecheck + lint + test
pnpm db:studio    # open Prisma Studio
```

## Docs

- `CLAUDE.md` how to work in this repo
- `docs/ERD.md` the data model and why it is shaped this way
- `docs/DATABASE.md` the Quran data, seeding, and safety checks
- `docs/DEPLOY.md` how to run it in production
- `docs/FUTURE.md` planned features (the channel bot, Discord)

## License

Code is under the 0BSD license (see `LICENSE`). The bundled Quran text is
from the Tanzil project and is used under the Tanzil terms (see `NOTICE`).
