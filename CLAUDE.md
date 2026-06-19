# CLAUDE.md

Notes for anyone (human or AI) working in this repo. Easy English on
purpose. The aim is that a junior developer can read this and be productive.

## What this is

Ayah is a Telegram bot that walks each subscriber through the Quran one ayah a
day — to **memorize** it, or simply to **reflect on its tafsir** (the tafsir
makes it serve both). It sends one ayah a day with the previous ayat of the
same surah for review (a per-user count, 0-20, default 10). Right after the
ayah it can also send that ayah's
recitation audio (in a chosen reciter's voice) and its tafseer, both as SILENT
messages (no notification sound). The tafseer is on by default (`/tafsir`); the
subscriber picks WHICH tafseer (التفسير الميسر — the default, المختصر, السعدي,
or ابن كثير) and HOW it arrives (the text inline, or a link) with `/tafsir`. The
audio defaults to الحصري المعلِّم and the subscriber picks the reciter — or none
— with `/reciter`. Each subscriber also
chooses where to begin (surah + ayah) and in which order to memorize: the
reverse hifz order (from An-Nas, the default) or the forward Mushaf order (from
Al-Fatihah). It is one small TypeScript project, with everything under `src/`:

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

1. Never type Quran text OR tafseer by hand. The text only comes from
   `pnpm data:fetch` (verified Tanzil Uthmani); the tafseer only from
   `pnpm data:fetch:tafseer` (each edition verified against the same oracle,
   from an authoritative source — see `src/database/reference/tafseers.ts`).
   The Surah, Ayah, and Tafseer tables are read-only after seeding.
2. Keep `core` pure. No database or network imports there. That is what
   keeps it easy to test.
3. The bot sends plain text, never Markdown or HTML parse_mode. Quran text
   would make a parsed message fail with a 400. See `src/lib/send.ts`.
4. Advance a subscriber's position ONLY when they mark the ayah DONE (the
   "أتممتُها" button or `/next`) — never on a mere send, and never on a failed
   one. The daily send records the day but does not move `currentEntryId`, so
   the same ayah (and its review window) repeats until done — exactly what hifz
   and unhurried tafsir-reading want — and no missed day skips an ayah. See
   "Read-gated" below.
5. One ayah per subscriber per local day. The `unique(subscriberId,
   scheduledFor)` index on `DeliveryLog` is the lock. Do not work around it.
   `confirmedAt` records whether that day's ayah was marked done.
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

Right after an ayah is delivered, the bot follows it with that ayah's tafseer as
one or more SILENT messages (`disable_notification`, so no second notification
sound), when the subscriber has tafseer on (`Subscriber.tafseerEnabled`, default
true). The tafseer is for TODAY's ayah only, never the review block.

WHICH tafseer and HOW are per-subscriber. `Subscriber.tafseerEdition` (default
`muyassar`) picks the edition from the `Tafseer` table; `Subscriber.tafseerFormat`
(`text` / `link`, default `text`) picks delivery. In `text` format the committed
text is sent inline (split across messages only if a long edition needs it; the
ayah is omitted if that edition has no seeded text). In `link` format no stored
text is read — just a header and a "read on the web" button. The one long
edition, Ibn Kathir (`kind: 'preview'` in the registry), is the exception: its
full text is too big to commit (like the audio), so only a one-message opening
is stored and `text` mode sends that opening plus a button to the rest. The
editions are reference data (`src/database/reference/tafseers.ts`); the link is
built by `tafseerLink` and surfaced as a tappable button (`tafseerReplyMarkup`
in deliver.ts, never a bare URL in the text); `pnpm verify:tafseer` checks every
edition's link still resolves (the tafseer's "trusted resource" check for the
link half).

Just before the tafseer (reading order: read → hear → understand), the bot also
sends the ayah's RECITATION AUDIO in the subscriber's chosen reciter's voice
(`Subscriber.reciter`; "none" = off, default الحصري المعلِّم). Audio is the one
thing NOT committed to the repo: one reciter for the whole Quran is ~1 GB, so we
never store the bytes. Instead the bot sends the CDN URL the first time an
(ayah, reciter) is needed and caches the Telegram file_id (`AyahAudio` table),
reusing it on every later send — so after the first send the audio lives on
Telegram, not the CDN. The reciters and their CDN folders are reference data
(`src/database/reference/reciters.ts`); the URL is built by `ayahAudioUrl`
(`src/core/audio.ts`) from `config.audioBaseUrl`. `pnpm verify:audio` checks the
source still serves every reciter (the audio's "trusted resource" check, in
place of a committed hashed file). See `deliverAyahAudio` in deliver.ts.

Both audio and tafseer are tied to the DELIVERY, not to showing the ayah: they
are sent only on a real `commitDelivery` returning 'sent', so each ayah's audio
and tafseer arrive exactly once — the day that ayah is delivered. A later
`/today` that just re-shows the same already-delivered ayah, or a peek on an off
day / while paused, sends the ayah again but NOT the audio or tafseer. Changing surah re-points the position; the new ayah's
tafseer then arrives the first time that ayah is actually delivered (now, if the
reposition records a free day; otherwise at the next scheduled send). Because both
the scheduler and `/today` gate on the 'sent' commit, the unique
(subscriber, date) lock guarantees the tafseer is sent once even in the
sub-second race. The send is wrapped so a tafseer hiccup never aborts the rest of
the batch (the delivery is already committed). See `tafseerMessagesFor` and the
record-gated `TodayView.tafseer` in deliver.ts, and `formatTafseerMessages` in
`src/core/tafseer.ts` — which now ALWAYS attaches a "اقرأ التفسير كاملًا" link to
the trusted source, so a cross-reference ("سبق الكلام عليها في أول سورة البقرة")
is one tap from the full text. We never substitute or invent tafsir text.

Both the audio and the tafseer read the subscriber's CURRENT settings at send
time, on every entry point (the scheduler, `/today`, and a reposition), so a
setting change is honoured on the very next delivery with no extra wiring:

- Switch voice with `/reciter <key>` (or pick "none"): the next ayah's clip uses
  that reciter's CDN URL, and the `file_id` cache is keyed by
  `(surah, ayah, reciter)`, so a changed voice is a cache MISS and fetches the
  new reciter — it never serves the old voice's cached clip. "none" sends no
  audio at all.
- Manage the tafseer with `/tafsir` (the tafseer card, also reached from
  `/settings`): turn it on/off, pick the edition, or switch text/link. The next
  delivered ayah honours the new choice — a changed edition reads from that
  edition's `Tafseer` rows, and `link` mode skips the stored text entirely. The
  tafseer is for TODAY's ayah only, never the review block.
- Jump with `/surah` (or a surah / onboarding button): the audio and tafseer are
  for the NEW ayah, because the reposition delivers from the new position; they
  arrive the first time that ayah is actually delivered (now if it records a free
  day, otherwise at the next scheduled send).
- Change the review count with `/review N`: that only resizes the review block
  shown with the ayah; the audio and tafseer are always for the single daily
  ayah, so they are unaffected.

To let a subscriber experience a new choice right away, the reciter-pick and
tafseer-edition-pick confirmations carry a "جرّب على آية اليوم" preview button
(on the confirmation reply, not as a permanent control — so switching text/link
or toggling on/off does not show it). Tapping it sends the new audio / tafseer
for today's ayah (today's DELIVERED ayah if there is one, else the current ayah)
as a SILENT peek — `sampleEntryFor` in deliver.ts resolves the ayah, and the
handlers reuse `deliverAyahAudio` / `tafseerMessagesFor`.
A preview is NOT a delivery: it records nothing in `DeliveryLog`, never advances
the position, and fires no milestone, so it can be tapped freely and never
duplicates or collides with the once-a-day send. (Pull, not push, on purpose —
consistent with `/today` and the silent-companion design.)

### Read-gated (advance only when done)

The position advances ONLY when the subscriber marks the ayah done — the
"أتممتُها — التالية" button under every ayah (`READ_CONFIRM` → `handleDone`), or
`/next` (`advanceAndShowNext`). The daily send, `/today`, and repositioning all
RECORD the day (`commitDelivery`, which now sets `currentEntryId` to the
delivered entry but never advances) without moving on, so the same ayah and its
review window repeat each day until done. `confirmRead` does the advance as an
atomic compare-and-set on `currentEntryId` (idempotent: a double/stale tap is a
harmless no-op), marks every still-unconfirmed `sent` row done, and is where the
surah-completion milestone now fires. A repeating unread ayah is led — on the
SCHEDULED daily push only (`deliverDueSubscribers`) — by a gentle
"لم تُتمّ آيتك منذ N يوم" nudge + an encouragement ayah (`countUnreadDeliveriesBefore`,
`pickQuranVirtue` in `reference/quran-virtues.ts`, `sendMissedDaysNudge`; the
ayah text is read from the DB, never typed). It is deliberately NOT sent on a
manual `/today` or a `/surah` reposition: there the reader is already engaged, so
re-engagement copy would only repeat and intrude. `/next` lets a fast learner advance
several ayat in one sitting; there is no "multiple ayat per day" setting. This
serves both audiences with one model: a memorizer taps done when memorized, a
tafsir reader when they have read/reflected — the wording is neutral.

`/today` and repositioning (`/surah` and the surah / onboarding buttons) show
today's ayah via `buildTodayView` + `sendTodayView`: the ayah is always the LIVE
current one (a view never advances), and on a free day the show is recorded so
the scheduler skips it. The same `unique(subscriber, scheduledFor)` lock keeps
it to one ayah per local day across every entry point. The "أتممتُها" button is
silent (the ayah is the day's one notification) and rides every shown ayah.

When the CONFIRMED ayah is the LAST of its surah, `handleDone` (and `/next`)
follows it with a milestone (`surahCompletionFor` decides, `buildCompletionMessage`
renders) naming the next surah, with buttons to continue / pick another / repeat
the surah. Finishing the track's final entry says "you completed the whole
Quran" instead — but only once a full track's worth of ayat has actually been
delivered (a `DeliveryLog` count), so picking a surah near the order's end can't
trigger a false khatma. A long surah
is never re-sent from its start: the review block is always the last N ayat
(`reviewCount`, 0–20), clamped so it never crosses into the previous surah. The
formatter (`src/core/format.ts`) splits a passage across messages at ayah
boundaries when it exceeds Telegram's limit; the longest single ayah
(Al-Baqarah 2:282, ~1173 chars) is well within one message.

## Consolidation review (التثبيت — the distant review)

The in-surah passage above is the RECENT review (القريبة). The harder half of
hifz is keeping the old, so each real daily delivery also sends a SILENT
«🔄 مراجعة للتثبيت» block: `oldReviewCount` ayat (0–10, default 3; 0 = off) drawn
from the subscriber's CONFIRMED corpus and rotated through it in track order by
a per-subscriber `reviewCursor`, looping — the classic المراجعة البعيدة. The
read-gated `confirmedAt` is the source of truth: the corpus is the track entries
with a confirmed delivery, **excluding the surah the reader is currently in**
(`countConfirmedAyat` / `getRevisionAyat` in delivery.service both take the
current surah to exclude). So it is genuinely OLD material — the surahs already
completed — and never duplicates today's in-surah passage; it shows only what
was truly memorized, never the current ayah, and grows with progress. A reader
still in their first surah therefore sees no review block (nothing old yet). `revisionMessagesFor` (deliver.ts) builds it and returns the
`nextReviewCursor`; the cursor advances once per recorded day, inside the same
`commitDelivery` transaction (a daily drip, like the lesson index used to be) —
so it is gated on a real 'sent' delivery, never a re-show, an off/paused peek, or
`/next`. The labeled cross-surah list is rendered by `formatRevisionMessages`
(format.ts). `/review` is the hub for both knobs (`reviewCount` and
`oldReviewCount`) via `src/lib/review-keyboard.ts`. A known limitation kept for a
later refinement: the in-surah recent review is empty at a surah's first ayah
(no earlier ayah in that surah); the distant rotation still covers everything.

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
pnpm data:fetch         # download + verify the Quran text (once; also committed)
pnpm data:fetch:tafseer # download + verify the tafseer editions (committed; pass keys for a subset)
pnpm verify:audio       # check the recitation-audio CDN serves every reciter
pnpm verify:tafseer     # check every tafseer edition's "read in full" link resolves
pnpm tafseer:demo       # send every edition/format for one ayah to the admin (test/compare)
pnpm db:deploy          # apply migrations (create tables)
pnpm db:seed            # fill Quran tables, the tafseer editions, and the tracks
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
- Tafseer editions: `src/database/reference/tafseers.ts` (registry — key,
  nameAr, kind, source, link), `prisma/data/tafseer-<key>.json` (committed,
  one per edition; Ibn Kathir holds only a one-message opening),
  fetched/verified by `scripts/fetch-tafseer.ts` (its pure text helpers live in
  `scripts/lib/tafseer-clean.ts`, unit-tested), link-checked by
  `scripts/verify-tafseer.ts`; seeded into the `Tafseer` table; read by
  `getTafseerText` (`src/database/services/tafseer.service.ts`). To eyeball
  every edition/format for one ayah in Telegram, `pnpm tafseer:demo [surah ayah]`
  sends them to the admin (`scripts/demo-tafseer.ts`, reads the committed files,
  no DB needed).
- Tafseer message rendering + link: `src/core/tafseer.ts` returns
  `TafseerMessage[]` (`formatTafseerMessages`, `tafseerLink`); the per-subscriber
  build is `tafseerMessagesFor` in deliver.ts, and the "read on the web" button
  is `tafseerReplyMarkup` there. The tafseer picker keyboard is
  `src/lib/tafseer-keyboard.ts`.
- Reciters (recitation audio): `src/database/reference/reciters.ts` (registry),
  `src/core/audio.ts` (`ayahAudioUrl`), `src/lib/send-audio.ts` (the send
  wrapper), `AyahAudio` (file_id cache) + `src/database/services/audio.service.ts`,
  `deliverAyahAudio` in deliver.ts, `scripts/verify-audio.ts` (source check).
- Curriculum order: `src/database/reference/curriculum.ts`
- Surah names and revelation: `src/database/reference/surahs.ts`
- Ayah count oracle: `src/database/reference/ayah-counts.ts`
- Message wording (Arabic): `src/lib/copy.ts`
- The review-range (previous ayat) and next-position math: `src/core/review.ts`
