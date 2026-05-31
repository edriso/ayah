# Future ideas

These are planned or possible features. They are written down so the current
design can support them later without a rewrite. None of them are built yet.

## The channel bot (most wanted)

A Telegram channel that posts one ayah a day for everyone to follow, in the
kids hefz order, and starts again when it finishes the whole Quran.

Why it fits the current design: a channel is just another delivery target. It
follows the same `Track` as users, at its own position. The cleanest way to
add it is to treat the channel as a special subscriber.

Suggested steps when we build it:

- Add a `kind` field to `Subscriber` ("user" or "channel"), or a small
  separate `ChannelSubscriber` row that reuses the same delivery code.
- Store the channel chat id and post with the same scheduler.
- Decide whether the channel post includes the review block or only the
  single daily ayah.

The delivery engine (`deliverDueSubscribers`) and the curriculum logic would
not need to change, because they already work on "a target with a position in
a track".

## A Discord version

The whole point of the `core` and `database` packages is that the brain is
written once. A Discord app would live in `apps/discord`, use discord.js, and
call the same services. The daily logic, the track walking, and the review
query are all reused.

## More tracks

The schema supports many tracks, and two now ship: `kids-hifz` (reverse, from
An-Nas, the default) and `mushaf` (forward, from Al-Fatihah). A subscriber
picks between them with `/order`, and picks a starting surah/ayah with
`/surah`; see `ORDERS` and `buildMushafOrder` in
`src/database/reference/curriculum.ts` and `setOrder` /
`setStartPosition` in the subscriber service.

Still possible with no schema change, only new seeded rows:

- a juz-only track (one juz at a time),
- a track that follows a specific school or teacher's plan.

Each new track is just rows in `Track` and `TrackEntry` built from an order
function and added by re-running `pnpm db:seed` (idempotent, per-track). No
migration is needed. The startup check (`assertTracksSeeded`) refuses to boot
until every order listed in `ORDERS` is fully seeded.

## Streaks and gentle reminders

`DeliveryLog` already records every send, so streaks and simple stats can be
built on top of it for free. A gentle "we missed you" nudge could be added
the same careful way the num-ninjas bot does it (opt-in, never spammy).

## Showing the surah's revelation place

`Surah.revelation` ("meccan" or "medinan") is already stored. A future
message could show a small tag like "this surah was revealed in Mecca", which
is nice context for learners. It is informational only and nothing depends on
it today.

## Optional tajweed and pause marks

The bundled Tanzil Uthmani text has the full vowel marks but not the OPTIONAL
recitation marks (waqf/pause signs, the rub-el-hizb quarter sign, and the
sequential-tanwin nun marks). The text is fully correct without them; they are
recitation aids printed in some Mushafs.

Tanzil can supply the text WITH these marks. A future option could let the
fetch script download that edition (and the bot could let a user choose "with
pause marks"). The rub-el-hizb sign would need handling so it does not appear
oddly in the middle of a single-ayah message. The checks in `fetch-quran.ts`
(6236 ayat, count per surah) work the same either way.

## Per-track review window

The PER-USER review count already ships: each subscriber sets it with
`/review N` (0 to 20, default 10, stored in `Subscriber.reviewCount`; see
`DEFAULT_REVIEW_COUNT` / `MIN_REVIEW_COUNT` / `MAX_REVIEW_COUNT` in
`src/core/review.ts`). What is NOT done yet is making the default or
the cap depend on the TRACK, so a future "adults" track could review more by
default. That would be a small change to where the default is read.

## Progress indicator

A "how far have I come" view (e.g. a `/progress` command) is motivating for
memorization. It is deferred on purpose: the kids track is the whole Quran
(6236 ayat) at one ayah a day, so a raw "ayah 12 of 6236" or "0.2%" would
discourage more than help. A good version needs a kinder framing (for example
progress within the current surah, or "you have memorized N ayat so far") and
should be designed before building. The data is available (`TrackEntry.position`
and `countTrackEntries`).

## Khatma completion celebration

When a subscriber finishes the whole Quran and the looping track wraps back to
An-Nas, a one-time "mabrook, you completed a khatma" banner would be a lovely
moment. It is deferred because at one ayah a day a full loop takes about 17
years, so it is effectively unreachable today; it becomes worth building if a
shorter track (e.g. Juz Amma only) ships. It would need a way to detect the
wrap-around (e.g. a `khatmaCount` field or checking for a delivery of the last
entry) so the banner shows once per khatma.
