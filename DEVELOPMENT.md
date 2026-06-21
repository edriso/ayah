# Working on Ayah (a guide for new developers)

This is a friendly, plain English guide to help you (human or AI) get productive
in this repo fast. It does not replace `CLAUDE.md`, which has the deep detail and
the rules. Read this first, then dip into `CLAUDE.md` for the part you touch.

No em dashes on purpose. Easy words on purpose.

## 1. What Ayah is, in one minute

Ayah is a Telegram bot. Each subscriber gets ONE ayah a day. They can use it to
memorize (hifz), or just to read and reflect on the tafsir. With the daily ayah
the bot also sends:

- the previous ayat of the same surah, for review,
- the recitation audio in the reader's chosen voice (silent message),
- the tafsir of that ayah (silent message),
- a button to mark the ayah done and move to the next one.

The reader moves forward ONLY when they press that button (or type `/next`). A
missed day never skips an ayah. We call this "read gated".

## 2. Run it on your machine

You need: Node 20+, pnpm, and a MySQL or MariaDB database.

```bash
pnpm install                 # install packages
cp .env.example .env         # then fill in BOT_TOKEN and the database URL
pnpm data:fetch              # download + verify the Quran text (once)
pnpm data:fetch:tafseer      # download + verify the tafsir editions (once)
pnpm db:deploy               # create the tables
pnpm db:seed                 # fill the Quran, tafsir, and the two tracks
pnpm dev                     # run the bot with reload
```

Useful while developing:

```bash
pnpm test          # run all tests (vitest)
pnpm typecheck     # type errors only
pnpm lint          # eslint
pnpm check         # typecheck + lint + test (run this before you push)
pnpm db:studio     # browse the database in the browser
```

There is ONE `.env` at the repo root. Code finds it on its own, so you can run a
command from any folder.

## 3. Where the code lives

```
src/core        pure logic. No database, no network. Easy to test.
src/database     the Prisma client, the services (all DB reads/writes), reference data.
src/lib          the glue: message text (copy.ts), the send wrappers, keyboards, deliver.ts.
src/bot.ts       the grammY bot: every command and every button handler.
src/scheduler.ts the once-a-minute job that runs the daily send.
prisma/          the schema, migrations, and the seed script.
```

A good rule: keep thinking in `core` (pure, tested), keep talking to the
database in `database/services`, and keep Telegram in `bot.ts` and `lib`.

Some `core` files (schedule, days, arabic, env) and `lib/{send,logger}` are tiny
re-exports from a shared package called `telegram-bot-kit`. To change that shared
code you edit the kit, not here. See `CLAUDE.md` for how.

## 4. The core idea: read gated

This is the heart of the bot. Learn it once and the rest makes sense.

- Each subscriber has a `currentEntryId` (where they are now in the track).
- The daily send shows the current ayah and RECORDS the day, but it does NOT
  move `currentEntryId`. So the same ayah comes back tomorrow until it is done.
- The position moves ONLY when the reader confirms: the "أتممتُها" button or
  `/next`. Both call `advanceAndShowNext`, which confirms the current ayah,
  moves forward one step, and shows the next ayah (with its own button).
- One ayah per local day is enforced by a unique index `(subscriberId,
  scheduledFor)` on `DeliveryLog`. Do not work around it.

Why this matters: it means a person who misses three days does not lose three
ayat. They come back to exactly where they were.

## 5. How the daily send works (the happy path)

`deliverDueSubscribers` in `src/lib/deliver.ts` runs every minute. For each
active, not blocked subscriber:

1. Is it their time today, in their own timezone and active days? If not, skip.
2. Already delivered today? If yes, skip.
3. Find the ayah to send (their current one).
4. Send the ayah (plus the review block).
5. On success, record the day in one transaction (no advance).
6. Send the recitation audio, then the tafsir, then the consolidation review,
   all as silent messages. Then send the "أتممتُها" button.

One subscriber failing is caught and never stops the others.

## 6. Two extra ideas you will meet

- Buttons carry an id. The "done" button is `ayah:done:<entryId>`. A tap on an
  old button (from an ayah the reader already passed) is a gentle no-op. Same
  idea for the on-demand "📖 التفسير" and "🎧 الاستماع" buttons, which are pinned
  to the ayah their message showed.
- Progressive disclosure. The daily send pushes the tafsir and audio for you.
  But a `/next` reveal, or a `/today` re-show, does NOT. Instead it offers small
  buttons to pull the tafsir or audio on demand. This keeps the screen clean for
  a fast reader and still gives the tafsir reader what they came for.

## 7. How to make a change safely

1. Read the part of `CLAUDE.md` that covers what you touch.
2. Put pure logic in `core` and write a test for it.
3. Put DB work in a service in `database/services`.
4. User facing words go in `src/lib/copy.ts`, never inline in handlers.
5. Telegram text is sent as PLAIN text, never Markdown or HTML. Quran characters
   break parsed messages with a 400. See `src/lib/send.ts`.
6. Run `pnpm check`. Keep it green.
7. Small, focused commits. Do not add a `Co-Authored-By` line.

### Common small tasks

- Change a message: edit `src/lib/copy.ts`. Look for the `COPY` object.
- Add a command: add a `bot.command('name', ...)` handler in `src/bot.ts`, and a
  menu entry in `setBotProfile` (same file).
- Add a button: pick a unique callback string (namespaced like `ayah:thing`),
  build it in a keyboard, and add a `bot.callbackQuery(...)` handler. Always
  call `ctx.answerCallbackQuery()` so the spinner clears.
- Change the schema: edit `prisma/schema.prisma`, then `pnpm db:migrate` to make
  a migration, and commit the new folder under `prisma/migrations/`.
- Rebrand the recitation cover: replace `assets/audio-thumb.jpg` (a small square
  image, max 320x320). It is the thumbnail shown on the daily audio clip. Only
  new (not-yet-cached) ayat pick it up; clear the `AyahAudio` table to refresh
  the rest.

## 8. Golden rules you must not break

1. Never type Quran text or tafsir by hand. It only comes from the fetch
   scripts, which verify it against a trusted source.
2. Keep `core` pure (no database, no network).
3. Plain text only when sending (no parse_mode).
4. Advance the position only on a confirmed done, never on a send.
5. One ayah per subscriber per local day. The unique index is the lock.

If something here ever disagrees with the code, the code and `CLAUDE.md` win.
Please fix this guide when you notice that.
