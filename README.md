# Ayah

A Telegram bot that helps people memorize the Quran. It sends one ayah a
day to each subscriber, together with the previous ayat of the same surah
for review (how many is up to each person: 0 to 20, default 10). Each person
picks the days and the time they want, and can take a break whenever they
need to.

The bot text is in Arabic. The code and docs are in English so any
developer can work on it.

## How it works (in one minute)

- Every subscriber follows a track. The default track is `kids-hifz`, which
  walks the Quran from An-Nas (114) back to Al-Fatihah (1). Inside each
  surah the ayat go in normal order (1, 2, 3 ...). This is the order many
  teachers use with children because the short surahs come first.
- A subscriber has a position in the track. Each day they receive the ayah
  at their position, plus a review of the previous ayat in that surah (10 by
  default, set with `/review`, 0 to 20). Then their position moves forward by
  one. On long surahs the review is split across several messages so it never
  exceeds Telegram's size limit.
- Right after the ayah, the bot can send that ayah's **recitation audio** (in a
  reciter the person chooses, or none) and its **tafseer** — both as **silent**
  messages, no second notification sound. The tafseer is on by default; with
  `/tafsir` the person chooses which one (التفسير الميسر — the default, المختصر,
  السعدي, or ابن كثير) and how it arrives (the text inline, or a link to read it
  in full). The audio defaults to الحصري المعلِّم (the kids teacher style) and
  the reciter is picked with `/reciter` (seven reciters, or off). Both are sent
  once, the day the ayah is delivered, and always match the reader's current
  settings: change the reciter and the next ayah is recited in the new voice;
  switch the tafseer edition and the next one follows; jump to another surah and
  the new ayah's audio and tafseer follow it — each taking effect from the next
  delivered ayah. After a change, a "جرّب على آية اليوم" button lets the person
  preview the new voice or tafseer on today's ayah right away (a silent peek
  that does not re-deliver or advance anything).
- The Quran text is verified Tanzil Uthmani text, and every tafseer edition is
  verified against the same count oracle and comes from an authoritative source.
  They live in read-only database tables and are never changed by the bot. The
  recitation audio is not stored in the repo (it is large) — and neither is the
  full Ibn Kathir tafseer; both are fetched/linked rather than committed in
  full. See `docs/DATABASE.md`.

## Project layout

This is one small TypeScript project. Everything lives under `src/`, kept in
clear folders:

```
src/core       Pure logic, no database and no network. Easy to test.
src/database   The Prisma client and the database services.
src/           The grammY bot itself: commands, the scheduler, and lib helpers.
```

The split means the brain (`core`) is written and tested once, `database` owns
all data access, and the rest of `src` is a thin Telegram adapter. `prisma/`
holds the schema, migrations, and the seed; `scripts/` holds the data fetch.

## Requirements

- Node.js 20 or newer
- pnpm 10 or newer
- A MySQL or MariaDB database

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Create the one env file and fill it in
cp .env.example .env
#    - set BOT_TOKEN (from @BotFather)
#    - set DATABASE_URL (your MySQL connection)

# 3. Download and verify the Quran text and the tafseer (frozen data files)
#    Both are also committed to the repo, so if you just cloned this you can
#    skip this step.
pnpm data:fetch
pnpm data:fetch:tafseer

# 4. Create the tables (applies the migrations)
pnpm db:deploy

# 5. Seed surahs, ayat (text + tafseer), and the tracks
pnpm db:seed

# 6. Run the bot
pnpm dev
```

If `pnpm data:fetch` cannot reach Tanzil, set `QURAN_SOURCE_URL` to a Tanzil
"Text (with aya numbers)" download of the Uthmani text and run it again. The
script checks what it downloads (6236 ayat, correct count per surah) and
refuses to write anything that does not match.

## Commands the user sees (Arabic)

- `/today` read today's ayah now (counts as today's, so it is not sent again)
- `/surah` pick the surah (and ayah) you start from
- `/order` pick the order: from An-Nas (hifz) or from Al-Fatihah (Mushaf)
- `/time HH:MM` set the daily send time
- `/days` pick which weekdays you receive ayat
- `/review N` how many previous ayat to review (0 to 20, default 10)
- `/tafsir` the silent tafseer after the ayah: turn it on/off, choose which one
  (التفسير الميسر / المختصر / السعدي / ابن كثير), and how it arrives (text or link)
- `/reciter` pick the reciter for the silent recitation audio, or turn it off
- `/timezone Area/City` set your timezone
- `/pause` take a break, or come back from one (one toggle command)
- `/settings` show your current settings
- `/help` help

(`/break` and `/resume` also work, as older names for `/pause`.)

Sending `/time` or `/timezone` with no argument shows tap-to-pick buttons
(common times and cities), so a non-technical user never has to type a format
or an IANA name. Times and counts accept Arabic-Indic digits too.

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
