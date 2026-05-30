# CLAUDE.md

Notes for anyone (human or AI) working in this repo. Easy English on
purpose. The aim is that a junior developer can read this and be productive.

## What this is

Ayah is a Telegram bot that sends one Quran ayah a day to each subscriber,
with the last ten ayat of the same surah for review. It is a pnpm workspace:

- `packages/core` pure logic, no database, no network. Fully unit-tested.
- `packages/database` Prisma schema, the client, and services.
- `apps/telegram` the grammY bot: commands and the daily scheduler.

Read `docs/ERD.md` and `docs/DATABASE.md` before changing data or the schema.

## Golden rules

1. Never type Quran text by hand. The text only comes from `pnpm data:fetch`
   (verified Tanzil Uthmani). Surah and Ayah tables are read-only after
   seeding.
2. Keep `core` pure. No database or network imports there. That is what
   keeps it easy to test.
3. The bot sends plain text, never Markdown or HTML parse_mode. Quran text
   would make a parsed message fail with a 400. See `apps/telegram/src/lib/send.ts`.
4. Advance a subscriber's position ONLY after a real send. A failed send
   must retry the same ayah, never skip it.
5. One ayah per subscriber per local day. The `unique(subscriberId,
   scheduledFor)` index on `DeliveryLog` is the lock. Do not work around it.

## How the daily send works

`deliverDueSubscribers` (in `apps/telegram/src/lib/deliver.ts`) runs every
minute. For each active, non-blocked subscriber:

1. `dueLocalDate` checks their own timezone, send time, and active days.
2. If already delivered for that local date, skip.
3. Resolve the entry to send (current, or first if new).
4. Send the message.
5. On success, record the delivery and move to the next entry, in one
   transaction.

One subscriber failing is caught and never stops the rest of the batch.

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

Edit `packages/database/prisma/schema.prisma`, then make a migration:

```bash
pnpm db:migrate     # prisma migrate dev: creates a new migration and applies it
```

Commit the new folder under `prisma/migrations/`. Production applies it with
`pnpm db:deploy`. Use `pnpm db:push` only for quick throwaway experiments;
real changes go through a migration so production stays in step.

## Gotchas

- There is ONE `.env`, at the repo root. Every package and script loads it
  through `loadEnv()` in `packages/core/src/env.ts`, which finds the root
  (the folder with `pnpm-workspace.yaml`) no matter where the command runs.
  `prisma.config.ts` has the same loader inline (the Prisma CLI loads that
  file on its own, so it cannot import from core).
- Prisma 7 does not read `.env` on its own and does not take the URL in the
  schema. The CLI gets the URL from `prisma.config.ts`; the running bot
  builds its own client in `src/client.ts`.
- The generated Prisma client lives in `packages/database/src/generated`.
  It is git-ignored. Run `pnpm db:generate` if imports from it fail.
- `activeDays` is a 7-bit mask (bit 0 = Monday). Use the helpers in
  `packages/core/src/days.ts`, do not do bit math by hand elsewhere.
- Timezone and day math always take `now` as an argument so they can be
  tested. Do not call `new Date()` deep inside pure functions.

## Where things live

- Curriculum order: `packages/database/src/reference/curriculum.ts`
- Surah names and revelation: `packages/database/src/reference/surahs.ts`
- Ayah count oracle: `packages/database/src/reference/ayah-counts.ts`
- Message wording (Arabic): `apps/telegram/src/lib/copy.ts`
- The "last 10" and "next position" math: `packages/core/src/review.ts`
