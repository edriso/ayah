# The Quran data: source, seeding, and safety

For this project the text must be correct. This page explains where the text
comes from and the checks that protect it.

## Where the text comes from

We use the Uthmani text from the [Tanzil project](https://tanzil.net). It is
verified against the Madina Mushaf and is the same text used by Quran.com and
AlQuran.cloud. We never type Quran text by hand. It only ever comes from the
authoritative Tanzil download.

The Tanzil terms allow copying the text without change, as long as we keep it
unchanged, name Tanzil as the source, and link to tanzil.net. We do all
three. See the `NOTICE` file.

## The pipeline

```
pnpm data:fetch   download + verify + write the frozen JSON file
pnpm db:push      create the tables
pnpm db:seed      fill Surah, Ayah, Track, TrackEntry from the JSON
```

### Step 1: data:fetch

`packages/database/scripts/fetch-quran.ts` downloads the Tanzil Uthmani
"Text (with aya numbers)" file. It then checks the result hard:

- there must be exactly 6236 ayat,
- there must be exactly 114 surahs,
- each surah must have the exact number of ayat from our independent count
  table, numbered 1, 2, 3 ... with no gaps.

If anything is off (a truncated download, a wrong edition, a network proxy
returning HTML), the script stops with a clear message and writes nothing.
Only a fully correct download is saved, to:

```
packages/database/prisma/data/quran-uthmani.json
```

That file also stores a SHA-256 of the text so any later change is visible.

If Tanzil changes its download URL, set `QURAN_SOURCE_URL` to a current
Tanzil Uthmani "Text (with aya numbers)" link and run `pnpm data:fetch`
again.

### Step 2 and 3: db:push and db:seed

`db:push` creates the tables from the Prisma schema. `db:seed` reads the
frozen JSON, checks it again against the same count table, and then fills:

- `Surah` from the reference table in `src/reference/surahs.ts`, with
  `ayahCount` taken from the actual text.
- `Ayah` from the text.
- `Track` `kids-hifz`.
- `TrackEntry` in the kids order (surah 114 down to 1, ayat ascending).

The seed is safe to run twice. If the text is already in place it stops.

## The count table (the oracle)

`src/reference/ayah-counts.ts` holds the number of ayat in each surah in the
Hafs reading. The total is exactly 6236. This is an independent check: both
the fetch and the seed compare the real text against it. A test asserts the
total is 6236, so a typo in the table is caught by the test suite.

## Startup check

When the bot starts, `assertQuranSeeded()` counts the rows. If there are not
exactly 114 surahs and 6236 ayat, the bot refuses to start. It is better to
fail loudly at boot than to send a broken ayah to a user.

## Why the text is read-only

The bot never writes to Surah or Ayah after seeding. Keeping the holy text
out of the day-to-day write path means a bad migration or a code bug can
never corrupt it.
