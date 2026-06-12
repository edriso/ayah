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

## Independent cross-check

Beyond the count checks below, the committed text was compared character by
character against a second, independent trusted reference (the AlQuran.cloud
`quran-uthmani` edition) across a sample of 366 ayat in 10 surahs spread over
the whole Quran (Al-Fatihah, Al-Kahf, Ya-Sin, Ar-Rahman, Al-Mulk, An-Naba,
Al-Kawthar, Al-Ikhlas, Al-Falaq, An-Nas).

Result: every ayah matched at the letter and vowel-mark level. The only
differences found were:

- Our Tanzil edition omits the OPTIONAL pause/tajweed annotation marks
  (waqf signs, the rub-el-hizb sign, sequential-tanwin nun marks). These are
  recitation aids, not part of the consonantal text. See the note about
  including them in `docs/FUTURE.md`.
- Two words ("Adam", "abaihim" in surah 18) use Tanzil's hamza-on-tatweel
  rendering while the other reference uses a standalone hamza. This is the
  same word and the same reading, only a different glyph seat.

So the text is the correct, verified Uthmani text. The basmala handling is
explained further down.

## The pipeline

```
pnpm data:fetch          download + verify + write the frozen Quran JSON file
pnpm data:fetch:tafseer  download + verify + write one frozen file per tafseer edition
pnpm db:deploy           create the tables by applying the migrations
pnpm db:seed             fill Surah, Ayah, Tafseer (per edition), Track, TrackEntry
```

### Step 1: data:fetch

`scripts/fetch-quran.ts` downloads the Tanzil Uthmani
"Text (with aya numbers)" file. It then checks the result hard:

- there must be exactly 6236 ayat,
- there must be exactly 114 surahs,
- each surah must have the exact number of ayat from our independent count
  table, numbered 1, 2, 3 ... with no gaps.

If anything is off (a truncated download, a wrong edition, a network proxy
returning HTML), the script stops with a clear message and writes nothing.
Only a fully correct download is saved, to:

```
prisma/data/quran-uthmani.json
```

That file also stores a SHA-256 of the text so any later change is visible.

If Tanzil changes its download URL, set `QURAN_SOURCE_URL` to a current
Tanzil Uthmani "Text (with aya numbers)" link and run `pnpm data:fetch`
again.

### Step 2 and 3: db:deploy and db:seed

`db:deploy` applies the migrations under `prisma/migrations/` to create the
tables. `db:seed` reads the frozen JSON, checks it again against the same
count table, and then fills:

- `Surah` from the reference table in `src/database/reference/surahs.ts`, with
  `ayahCount` taken from the actual text.
- `Ayah` from the text.
- `Tafseer`, one edition at a time, from the per-edition data files (each is
  optional: an edition whose file is missing is simply skipped).
- `Track` `kids-hifz` and `mushaf`.
- `TrackEntry` in each order (kids: surah 114 down to 1, ayat ascending;
  mushaf: surah 1 up to 114).

The seed is safe to run twice. If the text is already in place it stops seeding
the text; each tafseer edition is seeded only when it is not already complete
(so a newly fetched edition is added to an existing database on the next
`db:seed`, and a finished one is left untouched).

## The count table (the oracle)

`src/database/reference/ayah-counts.ts` holds the number of ayat in each surah in the
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

## The basmala

The Tanzil Uthmani edition we download merges the basmala
(بسم الله الرحمن الرحيم) into the text of ayah 1 for every surah except
At-Tawbah (9). In the standard Hafs numbering the basmala is a numbered ayah
only in Al-Fatihah; for other surahs it is written at the start but is not
part of ayah 1.

For correct ayah-by-ayah memorization, `fetch-quran.ts` separates the basmala
from ayah 1 (for surahs 2 to 114, except 9) and stores the pure numbered ayah.
The basmala bytes are taken verbatim from the source itself (surah 1 ayah 1),
never hand-typed, and saved in the data file.

The bot then shows the basmala as the surah opening, but only when both of
these are true:

1. The day's passage actually starts at ayah 1 — that is, ayah 1 is on screen.
   This is true when ayah 1 is today's ayah, or when the review block reaches
   back to ayah 1.
2. The surah uses a basmala at all (every surah except At-Tawbah).

When both hold, the basmala renders directly above ayah 1, exactly where it
belongs. So the reader always sees the full basmala in its correct place, and
nothing is removed from the text. The logic lives in `showsOpeningBasmala`,
`surahUsesBasmala`, and `getBasmala`.

A couple of surahs (At-Tin, Al-Qadr) carry the basmala with a slightly
different mark, so the match is done on letters (diacritics removed) to catch
those too.

## The tafseer

After the daily ayah the bot can send a tafseer (commentary) as a silent message
— once, the day that ayah is delivered (a later `/today` re-show of the same
ayah does not resend it). A subscriber **chooses which tafseer** they receive,
and **how** (the full text inline, or a link to read it). The editions live in
`src/database/reference/tafseers.ts`; we never type tafseer by hand, it only
comes from the fetch step.

The editions, all from authoritative sources:

| key | edition | source | stored |
| --- | --- | --- | --- |
| `muyassar` (default) | التفسير الميسر — King Fahd Complex | AlQuran.cloud `ar.muyassar` | full text |
| `mukhtasar` | المختصر في التفسير — Tafsir Center (مركز تفسير) | QuranEnc `arabic_mokhtasar` | full text |
| `saadi` | تفسير السعدي | Quran.Foundation `ar-tafseer-al-saddi` | full text |
| `ibnkathir` | تفسير ابن كثير | Quran.Foundation `ar-tafsir-ibn-kathir` | opening + link |

The concise editions are stored in full. **Ibn Kathir is the exception**: its
entries run to tens of thousands of characters, so — like the recitation audio —
we do not commit the whole thing. We store a bounded one-message opening
(`preview` kind) and the bot follows it with a tappable "read on the web" button
to the full text on quran.com. In "link" format every edition is sent as a
header + that button, with no stored text read at all (the URL is never a bare
link in the message text; see `tafseerReplyMarkup` in `src/lib/deliver.ts`).

### Where it comes from and how it is checked

`scripts/fetch-tafseer.ts` (run with `pnpm data:fetch:tafseer [edition...]`)
downloads each edition and checks it exactly like the Quran text:

- there must be exactly 6236 entries,
- there must be exactly 114 surahs,
- each surah must have the exact ayah count from the same oracle table,
  numbered 1, 2, 3 ... with no gaps,
- no entry may be empty.

Sources differ per edition: AlQuran.cloud serves a whole edition in one
response; QuranEnc and Quran.Foundation serve one surah/chapter at a time. The
Quran.Foundation text is HTML, so the fetch strips it to plain text; and because
its classical editions comment on ranges of ayat under one entry, the fetch
forward-fills within each surah so every ayah carries its group's commentary.
Only a fully correct download is saved, one file per edition
(`prisma/data/tafseer-<key>.json`) with a SHA-256 of the text. Because each
edition passes the same per-surah count check, it lines up one-to-one with the
ayat by `(surah, ayah)`.

`pnpm verify:tafseer` checks the other half — that the per-ayah "read in full"
link the bot builds still resolves on each source site (the same role
`verify:audio` plays for the recitation CDN).

To compare the editions and formats by eye, `pnpm tafseer:demo [surah ayah]`
sends every edition in both formats for one ayah (default Ayat al-Kursi) to the
admin in Telegram. It reads the committed files directly (no database) and
builds each message with the same code the bot uses, so it is a faithful
preview. The pure text helpers the fetch uses (HTML stripping, the preview
truncation, the range forward-fill) live in `scripts/lib/tafseer-clean.ts` and
are unit-tested.

### Independent cross-check

The committed Al-Muyassar text was compared against a second, independent
trusted source — [quranenc.com](https://quranenc.com), the Noble Quran
Encyclopedia by the Tafsir Center (مركز تفسير), edition `arabic_moyassar`. The
sampled ayat (including Al-Fatihah 1:2 and Ayat al-Kursi 2:255) matched
character for character, confirming it is the genuine King Fahd Complex
Al-Muyassar text.

### Where it is stored and why it is optional

The tafseer lives in its own `Tafseer` table, one row per `(edition, surah,
ayah)` (modeled like `AyahAudio`: a natural key, no FK to `Ayah`). The bot works
without it: if the chosen edition has no row for an ayah (e.g. a deployment that
has not fetched/seeded that edition), the daily send simply omits the tafseer
message. Per subscriber, `Subscriber.tafseerEnabled` (default true) decides
whether they get a tafseer at all, `tafseerEdition` (default `muyassar`) which
one, and `tafseerFormat` (`text` / `link`, default `text`) how — all set with
`/tafsir`. Like the text, the tafseer is read-only after seeding.

## The recitation audio

After the ayah (and before the tafseer) the bot can also send the ayah's
**recitation audio** in a reciter the subscriber chooses, as a silent message.
This is the one piece of content we do **not** store in the repo or the
database: the per-ayah MP3s are large (one reciter for the whole Quran is about
1 GB), far too much to commit like the text and tafseer.

### Where it comes from

The audio is the standard, widely used Mushaf Murattal recordings, served
per-ayah by [everyayah.com](https://everyayah.com) (the same recordings the
AlQuran.cloud / Islamic Network CDN serves). Each reciter is a folder; the file
name is the zero-padded surah+ayah, e.g.
`https://everyayah.com/data/Husary_128kbps/002027.mp3` is surah 2, ayah 27. The
reciters the bot offers — their key, Arabic name, and CDN folder — are listed in
`src/database/reference/reciters.ts`; the URL is built by `ayahAudioUrl` in
`src/core/audio.ts` from the configured base (`AUDIO_BASE_URL`, default
everyayah).

### How it is delivered without storing it

The first time an ayah is sent in a given reciter's voice, the bot passes the
CDN URL to Telegram, which fetches the MP3 and hands back a `file_id`. We store
that `file_id` in the `AyahAudio` table (keyed by surah, ayah, reciter) and
reuse it on every later send — so the audio is fetched from the CDN at most
once per (ayah, reciter), and after that it lives on Telegram's servers (no
ongoing dependency on the CDN). The table holds only short id strings and fills
lazily as ayat are delivered.

### Verifying the source

Because there is no committed, hashed data file to check, `pnpm verify:audio`
takes its place: it confirms every offered reciter's folder serves a real MP3
for a representative spread of ayat (the first ayah, Ayat al-Kursi, the longest
ayah, a surah with no basmala, and the last ayah). Run it after changing the
reciter list or the audio base URL.

### The per-subscriber choice

`Subscriber.reciter` holds a reciter key or `"none"`. It defaults to
`husary-muallim` (الحصري المعلِّم, the repeat-after-me teaching style — the most
fitting for memorization), so audio is on by default; a subscriber picks another
reciter or turns it off with `/reciter`. If the chosen reciter is `"none"` (or
an ayah's audio cannot be fetched), the send simply skips the audio — it is a
best-effort companion and never blocks the ayah.
