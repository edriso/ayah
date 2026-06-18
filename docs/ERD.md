# Data model (ERD)

This page explains every table and why it is shaped the way it is. The goal
is correctness: for an Islamic project the database should make wrong data
hard or impossible.

## The big idea

The Quran text is reference data. It is seeded once and never changed by the
bot. Everything that points at an ayah uses a real foreign key, so the
database itself blocks impossible things like "ayah 300 of a 7-ayah surah".

## Tables

```
Surah (114 rows, read-only)
  number      PK, 1..114
  nameAr      Arabic name
  nameEn      Latin transliteration
  revelation  "meccan" | "medinan"
  ayahCount   filled from the seeded ayat, so it can never drift

Ayah (6236 rows, read-only)
  id              PK
  surahNumber     FK -> Surah.number
  numberInSurah   1..ayahCount
  text            Uthmani text, exactly as Tanzil shipped it
  unique(surahNumber, numberInSurah)

Tafseer (commentary, read-only, one row per edition x ayah)
  edition        part of PK (edition key, see reference/tafseers.ts)
  surahNumber    part of PK
  numberInSurah  part of PK
  text           full tafseer, or a one-message opening for a "preview" edition
  primary key(edition, surahNumber, numberInSurah)

Track (the curriculum)
  id     PK
  key    unique, e.g. "kids-hifz"
  name   shown to humans
  loops  true: start over after the last entry

TrackEntry (one step = one ayah, in order)
  id        PK
  trackId   FK -> Track.id
  position  0-based order in the track
  ayahId    FK -> Ayah.id
  unique(trackId, position)
  unique(trackId, ayahId)

Subscriber (who we deliver to)
  id              PK
  telegramId      unique
  locale          "ar" | "en"
  timezone        IANA name, e.g. "Africa/Cairo"
  deliveryHour    0..23, local time
  deliveryMinute  0..59, local time
  activeDays      7-bit mask, bit 0 = Monday .. bit 6 = Sunday
  reviewCount     RECENT review: previous ayat of the same surah (0..20, default 10)
  oldReviewCount  CONSOLIDATION review (التثبيت): old confirmed ayat/day (0..10, default 3)
  reviewCursor    rotation index into the confirmed corpus (advances once per recorded day)
  tafseerEnabled  send the ayah's tafseer (silently) after it (default true)
  tafseerEdition  which tafseer edition (key, default "muyassar")
  tafseerFormat   "text" (inline) | "link" (default "text")
  reciter         recitation-audio reciter key, or "none" (default husary-muallim)
  trackId         FK -> Track.id
  currentEntryId  FK -> TrackEntry.id, the CURRENT ayah; null = not started
  pausedAt        null = active, set = on a break
  blockedAt       null = reachable, set = user blocked the bot
  startedAt       first delivery time

DeliveryLog (history + idempotency)
  id            PK
  subscriberId  FK -> Subscriber.id
  trackEntryId  FK -> TrackEntry.id
  scheduledFor  local date "YYYY-MM-DD"
  status        "sent" | "failed" | "skipped"
  sentAt
  confirmedAt   set when the reader marked this day's ayah DONE; null = not yet
  unique(subscriberId, scheduledFor)   <-- one ayah per local day

AyahAudio (recitation audio file_id cache)
  surahNumber    part of PK
  numberInSurah  part of PK
  reciter        part of PK (reciter key)
  fileId         Telegram file_id, reused on later sends
  primary key(surahNumber, numberInSurah, reciter)
```

## Why these choices

### The Quran text is in the database, not a loose file

Keeping it in tables lets foreign keys enforce correctness. A `TrackEntry`
cannot point at an ayah that does not exist. We still treat the text as
frozen: it is seeded once and a startup check refuses to run the bot unless
there are exactly 114 surahs and 6236 ayat.

### activeDays is a 7-bit number, not an array

MySQL has no array type, so the chosen weekdays are stored as one small
integer. Bit 0 is Monday and bit 6 is Sunday. 127 means every day. The
helpers live in `src/core/days.ts`.

### The break is a single `pausedAt` timestamp

`pausedAt` null means active. When set, the bot sends nothing and the
position does not move, so `/resume` continues exactly where the user left
off. This is an indefinite break, cleared only by `/resume`. (The num-ninjas
bot uses `pausedUntil` for fixed-length breaks; we chose indefinite to match
"make the bot stop sending me".)

### Idempotency lives in DeliveryLog

`unique(subscriberId, scheduledFor)` means a subscriber can get at most one
ayah per local day. Even if the scheduler double-fires, or the bot restarts
and runs a catch-up, the second insert fails and we skip.

### Read-gated: the position advances on a confirmed READ, not on the send

`confirmedAt` records whether the reader marked that day's ayah DONE (the
"أتممتُها — التالية" button, or `/next`). The daily send RECORDS the day but
does NOT move `currentEntryId`; only `confirmRead` advances it (an atomic
compare-and-set, idempotent against stale/double taps). So the same ayah repeats
each day until done — exactly what hifz wants, and no missed day skips an ayah.
The count of unconfirmed `sent` rows before today is the gentle "days since last
review" number; the surah-completion milestone fires on the confirm.

### The position is told apart from "finished"

`currentEntryId` null can mean two things, so we use `startedAt` to tell them
apart:

- `currentEntryId` null and `startedAt` null  -> brand new, start at 0
- `currentEntryId` set                          -> the CURRENT (unconfirmed) ayah
- `currentEntryId` null and `startedAt` set     -> finished a non-looping
  track, nothing more to send

The kids track loops, so the last case does not happen for it, but the code
handles it for any future non-looping track.

### Recitation audio is cached by file_id, not stored

The daily ayah's recitation audio is large — one reciter for the whole Quran is
about 1 GB — so we do not keep the audio in the repo or the database. The bot
sends the CDN URL the first time an ayah is needed in a given reciter's voice,
and stores the Telegram `file_id` it gets back in `AyahAudio`. Every later send
of that (surah, ayah, reciter) reuses the `file_id`, so it is instant and never
re-fetches. The table therefore holds only short id strings (at most
6236 ayat × the offered reciters, a few MB), and fills lazily as ayat are
delivered. See `docs/DATABASE.md` for the source and the reciter list.

## The two reviews

**Recent (القريبة) — `reviewCount`.** From the current entry we know the ayah's
surah and its number `n`. The recent review shows the `reviewCount` PREVIOUS
ayat of the SAME surah: `numberInSurah` between `max(1, n - reviewCount)` and
`n - 1` (the clamp to 1 stops it crossing into the previous surah; ayah 1 has
nothing earlier). It reads as one passage leading into today's ayah (الربط).
See `reviewRange` in `src/core/review.ts` and `formatDailyMessages`.

**Distant / consolidation (البعيدة, التثبيت) — `oldReviewCount` + `reviewCursor`.**
Each real daily delivery also revisits `oldReviewCount` previously-CONFIRMED ayat
(0 = off), rotating through the whole memorized corpus in track order via
`reviewCursor`, looping — so old memorization does not slip. The corpus is the
track entries with a confirmed delivery (`countConfirmedAyat` / `getRevisionAyat`
in `delivery.service.ts`); it shows only what was truly memorized, never the
current unconfirmed ayah, and grows with progress. The cursor advances once per
recorded day, inside the same `commitDelivery` transaction. The labeled
cross-surah list is rendered by `formatRevisionMessages` and sent silently.

Each delivery can be more than one message (today's ayah + its passage, then the
silent tafseer and the silent review). Long passages/lists split at ayah
boundaries so none exceeds Telegram's 4096-character limit (`src/core/format.ts`).
