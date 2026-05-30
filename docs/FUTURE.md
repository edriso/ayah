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
- Decide whether the channel post includes the last-ten review block or only
  the single daily ayah.

The delivery engine (`deliverDueSubscribers`) and the curriculum logic would
not need to change, because they already work on "a target with a position in
a track".

## A Discord version

The whole point of the `core` and `database` packages is that the brain is
written once. A Discord app would live in `apps/discord`, use discord.js, and
call the same services. The daily logic, the track walking, and the "last 10"
query are all reused.

## More tracks

The schema already supports many tracks. Examples:

- a juz-only track (one juz at a time),
- an adults track in normal order (Al-Fatihah first),
- a track that follows a specific school or teacher's plan.

Each track is just rows in `Track` and `TrackEntry`, reviewed by a teacher
and seeded from a file. No code change is needed to add one.

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

The review window is fixed at ten ayat (`REVIEW_WINDOW` in
`packages/core/src/review.ts`). It is already a parameter, so a per-track or
per-user window would be a small change.
