# CLAUDE.md

Notes for anyone (human or AI) working in this repo. Easy English on
purpose. The aim is that a junior developer can read this and be productive.

## What this is

Ayah is a Telegram bot that sends one Quran ayah a day to each subscriber,
with the previous ayat of the same surah for review (a per-user count, 0-20,
default 10). Each subscriber chooses where to begin (surah + ayah) and in
which order to memorize: the reverse hifz order (from An-Nas, the default) or
the forward Mushaf order (from Al-Fatihah). It is one small TypeScript
project, with everything under `src/`:

- `src/core` pure logic, no database, no network. Fully unit-tested.
- `src/database` the Prisma client and the database services.
- `src/` (bot.ts, scheduler.ts, lib/, ...) the grammY bot: commands and the
  daily scheduler. `prisma/` holds the schema, migrations, and seed; `scripts/`
  holds the data fetch.

The cross-bot kernel lives in **`telegram-bot-kit`** (a separate public repo,
pinned by git tag in `package.json`): the timezone/schedule math, the active-day
bitmask, Arabic-Indic digits, the root `.env` loader, the logger, and the
plain-text send wrapper. The matching files here (`src/core/schedule.ts`,
`days.ts`, `arabic.ts`, `env.ts`; `src/lib/send.ts`, `logger.ts`) are one-line
re-export shims, so existing imports of `../core` / `./send` / `./logger` keep
working while the code lives (and is tested) once, in the kernel. To change that
code: edit the kernel, `pnpm check`, tag a new version, and merge the Renovate
bump PR it opens here. The tilawah bot consumes the same kernel.

Read `docs/ERD.md` and `docs/DATABASE.md` before changing data or the schema.

## Golden rules

1. Never type Quran text by hand. The text only comes from `pnpm data:fetch`
   (verified Tanzil Uthmani). Surah and Ayah tables are read-only after
   seeding.
2. Keep `core` pure. No database or network imports there. That is what
   keeps it easy to test.
3. The bot sends plain text, never Markdown or HTML parse_mode. Quran text
   would make a parsed message fail with a 400. See `src/lib/send.ts`.
4. Advance a subscriber's position ONLY after a real send. A failed send
   must retry the same ayah, never skip it.
5. One ayah per subscriber per local day. The `unique(subscriberId,
   scheduledFor)` index on `DeliveryLog` is the lock. Do not work around it.
6. A track is the whole Quran in one order, every ayah present. There are two:
   `kids-hifz` (reverse, from An-Nas, the default) and `mushaf` (forward,
   from Al-Fatihah). Both are seeded data, not code. Choosing a STARTING POINT
   is just pointing `Subscriber.currentEntryId` at the matching `TrackEntry`
   (see `setStartPosition`); choosing an ORDER is moving the subscriber to the
   other track and re-pointing `currentEntryId` at the same (surah, ayah)
   there (see `setOrder`). Adding another order is a new `Track` + `db:seed`,
   no migration.

## How the daily send works

`deliverDueSubscribers` (in `src/lib/deliver.ts`) runs every
minute. For each active, non-blocked subscriber:

1. `dueLocalDate` checks their own timezone, send time, and active days.
2. If already delivered for that local date, skip.
3. Resolve the entry to send (current, or first if new).
4. Send the message.
5. On success, record the delivery and move to the next entry, in one
   transaction.

One subscriber failing is caught and never stops the rest of the batch.

`/today` and repositioning (`/surah` and the surah / onboarding buttons) deliver
today's ayah the same way: they reuse `buildTodayView` + `commitDelivery`, so a
subscriber who reads early "claims" the day (records the delivery and advances)
and the scheduler then skips it. The same `unique(subscriber, scheduledFor)`
lock keeps it to one ayah per local day across every entry point.

## Conventions

- TypeScript, ESM, strict mode.
- Prisma models are PascalCase, fields camelCase, with `@map`/`@@map` to
  snake_case tables and columns. We do not use Prisma enums; a short string
  field with a comment listing the allowed values is enough.
- Comments explain WHY, not what. Match the density already in the files.
- Tests use vitest. Add tests for new logic, including edge cases.

## Common commands

```bash
pnpm install
pnpm data:fetch     # download + verify the Quran text (once; also committed)
pnpm db:deploy      # apply migrations (create tables)
pnpm db:seed        # fill Quran tables and the kids track
pnpm dev            # run the bot with reload
pnpm test           # all tests
pnpm check          # typecheck + lint + test (run before pushing)
pnpm db:studio      # browse the database
```

### Changing the schema

Edit `prisma/schema.prisma`, then make a migration:

```bash
pnpm db:migrate     # prisma migrate dev: creates a new migration and applies it
```

Commit the new folder under `prisma/migrations/`. Production applies it with
`pnpm db:deploy`. Use `pnpm db:push` only for quick throwaway experiments;
real changes go through a migration so production stays in step.

## Gotchas

- There is ONE `.env`, at the repo root. Code and scripts load it through
  `loadEnv()` in `src/core/env.ts`, which finds the root (the folder with
  `package.json`) no matter where the command runs. `prisma.config.ts` has the
  same loader inline (the Prisma CLI loads that file on its own, so it cannot
  import from core).
- `NODE_ENV` defaults to `production` (in `.env.example` and the Docker
  image). `pnpm dev` sets `NODE_ENV=development` itself, so local work always
  runs in development mode (debug logs, and the Prisma client is stashed on
  `globalThis` so `tsx watch` reloads do not leak DB connections) no matter
  what `.env` says. dotenv does not override an already-set variable, so the
  value from `pnpm dev` wins over `.env`.
- Prisma 7 does not read `.env` on its own and does not take the URL in the
  schema. The CLI gets the URL from `prisma.config.ts`; the running bot
  builds its own client in `src/database/client.ts`.
- The generated Prisma client lives in `src/database/generated`.
  It is git-ignored. Run `pnpm db:generate` if imports from it fail.
- `activeDays` is a 7-bit mask (bit 0 = Monday). Use the helpers in
  `src/core/days.ts`, do not do bit math by hand elsewhere.
- Timezone and day math always take `now` as an argument so they can be
  tested. Do not call `new Date()` deep inside pure functions.

## Where things live

- Shared kernel (schedule, days, arabic, env, logger, send): the
  `telegram-bot-kit` package; the matching `src/core/*` and `src/lib/{send,logger}.ts`
  files are re-export shims.
- Curriculum order: `src/database/reference/curriculum.ts`
- Surah names and revelation: `src/database/reference/surahs.ts`
- Ayah count oracle: `src/database/reference/ayah-counts.ts`
- Message wording (Arabic): `src/lib/copy.ts`
- The review-range (previous ayat) and next-position math: `src/core/review.ts`
