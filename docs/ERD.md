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
  reviewCount     previous ayat to review (0..20, default 10)
  trackId         FK -> Track.id
  currentEntryId  FK -> TrackEntry.id, null = not started
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
  unique(subscriberId, scheduledFor)   <-- one ayah per local day

CronRun (observability)
  records each scheduled job run, pruned after 30 days
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
and runs a catch-up, the second insert fails and we skip. The position only
advances after a real send, so a failed send is retried, never skipped.

### The position is told apart from "finished"

`currentEntryId` null can mean two things, so we use `startedAt` to tell them
apart:

- `currentEntryId` null and `startedAt` null  -> brand new, start at 0
- `currentEntryId` set                          -> that entry is next
- `currentEntryId` null and `startedAt` set     -> finished a non-looping
  track, nothing more to send

The kids track loops, so the last case does not happen for it, but the code
handles it for any future non-looping track.

## The review query

From the current entry we know the ayah's surah and its number `n`. The
review shows the subscriber's `reviewCount` PREVIOUS ayat (not today's): ayat
where `surahNumber = surah` and `numberInSurah` is between
`max(1, n - reviewCount)` and `n - 1`. The clamp to 1 stops it crossing into
the previous surah; when `n` is ayah 1 there is nothing to review. Today's
ayah is shown on its own, so the longest verses are never duplicated. See
`src/core/review.ts`.

Each delivery can be more than one message: today's ayah, then the review.
On long surahs the review is split across several messages so none exceeds
Telegram's 4096-character limit (see `formatDailyMessages` in
`src/core/format.ts`). The default review of 10 always fits in one
message; only larger settings split, and then only in the longest surahs.
