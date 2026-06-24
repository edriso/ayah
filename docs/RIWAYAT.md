# Other riwayat (Warsh, Qaloon, ...) — design and feasibility

This is the deep plan behind the short "Other riwayat" note in `FUTURE.md`. It
exists because a community request (the إتقان thread) asked for memorizing in a
riwayah other than Hafs — specifically **Warsh عن نافع من طريق الأصبهاني**, and
**Qaloon**, with matching reciters (محمد إرشاد مربعي، أحمد ديبان، محمد عبدالكريم).

Read this before anyone tries to "just add a Warsh reciter". The short version:
the request is sound and the data model is designed below, but the **per-ayah
audio** the bot needs does not exist for those reciters today, and the **text**
requires a new verified-data pipeline. It is a real project, not a row in
`reciters.ts`.

## The core insight: a riwayah is text + numbering + audio, as one unit

The bot today assumes ONE riwayah everywhere:
- one seeded Quran text (Tanzil Uthmani = Hafs عن عاصم),
- one ayah numbering (the Kufic count, 6236 ayat),
- a "reciter" is only an audio-folder choice (`reference/reciters.ts`).

Warsh and Qaloon break all three at once, so they cannot be modeled as "more
reciters". A faithful riwayah is a bundle of three things that must agree:

1. **Text (rasm).** Warsh/Qaloon differ from Hafs in many words. Showing Hafs
   text with a Warsh reciter (or vice versa) is simply wrong, and the project's
   golden rule #1 forbids showing unverified Quran text.
2. **Ayah numbering (عدّ الآي).** Hafs uses the **Kufic** count = **6236**.
   Warsh and Qaloon are conventionally printed with the **Madani** count =
   **6214**. The boundaries differ (e.g. Al-Fatihah's basmala, the splits in
   several surahs). Sources: islamweb fatwa 75878; Wikipedia «علم عد الآي».
   The accurate framing (islamweb): the count belongs to a *counting school*
   (Kufic/Madani/Makki/Basri/Shami), not to the riwayah name — but the printed
   and recorded Warsh/Qaloon mushafs use Madani, so in practice a Warsh track
   carries Madani numbering.
3. **Audio.** The reciter must recite that riwayah, and — for THIS bot — must be
   available as **per-ayah** clips named `SSSAAA.mp3` (the everyayah convention),
   because the product is one silent ayah-clip per day.

The right product model (from the maintainer's own framing):
**riwayah is the parent choice; reciters are filtered by it; changing riwayah
changes the mushaf text.** Default riwayah = Hafs (today's behavior, unchanged).

## What the research found (trusted sources, June 2026)

### Text — feasible and verifiable
- **King Fahd Complex (KFGQPC)** developer platform — the authoritative source —
  publishes each narration (Hafs, **Warsh**, **Qaloon**) as machine-readable
  CSV / JSON / SQL / XML / XLSX, free for developers, with the riwayah's own
  (Madani) numbering. https://qurancomplex.gov.sa/quran-dev/
- **KSU Electronic Mushaf** carries a Warsh mushaf (رواية ورش عن نافع) — a viable
  **second independent oracle** to cross-check Warsh text, the way Hafs is
  cross-checked against AlQuran.cloud. https://quran.ksu.edu.sa/
- NOT available from the bot's current oracles: Tanzil (Hafs only) and
  AlQuran.cloud (its `/edition` list is 13 editions, all Hafs/Uthmani — no
  Warsh/Qaloon). QUL/Tarteel's public quran-script resources are Hafs only too.

So a verified Warsh text is obtainable (KFGQPC primary + KSU second oracle).
Qaloon's second oracle is weaker and needs more sourcing work.

### Numbering — comes with the text, but tafseer mapping is extra
The KFGQPC Warsh/Qaloon data already carries Madani numbering, so the track and
the displayed text are internally consistent for free. The hard part is the
**tafseer**: every tafseer edition the bot seeds (QuranEnc + quran.com) is keyed
to the **Kufic/Hafs** (surah, ayah). A Warsh ayah (Madani) does not map 1:1 to a
tafseer row. Options: (a) ship non-Hafs riwayat with tafseer OFF and a clear
note, or (b) build a verified Madani↔Kufic ayah-conversion table and translate
the key before the tafseer lookup. (a) is the honest MVP.

### Audio — this is the real blocker
- The bot's model is strictly **per-ayah** MP3 (`SSSAAA.mp3`), one silent clip
  a day.
- everyayah.com lists three Warsh reciters (all the **Al-Azraq** route, one —
  Abdul Basit — flagged "47 files missing"), but when probed at
  `everyayah.com/data/<folder>/001001.mp3` they 404 — i.e. they are NOT reachable
  per-ayah at the path the bot builds. No Qaloon, no Asbahani there at all.
- The reciters the community asked for (محمد إرشاد مربعي via Asbahani; أحمد ديبان;
  محمد عبدالكريم) DO exist — but only as **per-surah / multi-segment** files on
  archive.org and mp3quran.net, with **no ayah-level timing/segmentation**.

  Re-confirmed 2026-06-24 (per رقية's follow-up naming these three):
  - **محمد إرشاد مربعي** — Asbahani, but split **by surah only** (≈88 files,
    IslamWeb qid 2421). No per-ayah split.
  - **أحمد ديبان** — his complete Quran on mp3quran.net is Warsh **via Al-Azraq**,
    not Asbahani (the route رقية asked for); no per-ayah Asbahani set found.
  - **محمد عبدالكريم** — complete 604-page Asbahani set exists, but that is a
    **per-PAGE** set, not per-ayah. It therefore fits the **tilawah** bot (page
    unit), where it has SHIPPED, and still does not unlock ayah (ayah needs
    per-ayah). See tilawah `docs/RIWAYAT.md`.

Conclusion: **no non-Hafs riwayah currently has complete, per-ayah audio
reachable from a trusted CDN in the bot's format.** The text half is solvable;
the audio half is the gate. Unlocking it means either:
- producing per-ayah segments from full-surah recordings (a separate data
  project: needs verified ayah timestamps; error-prone; must be "very well
  tested" against the audio), or
- adding a per-SURAH audio mode for non-Hafs tracks (a product change that breaks
  the one-ayah-a-day silent-companion design — likely a poor fit).

## Implementation plan (staged; each stage shippable and tested)

The model below is additive: Hafs stays the default and nothing changes for
existing subscribers until they opt into another riwayah.

### Stage 0 — Grow the Hafs reciter list (DONE)
Pure win, no schema change. `reference/reciters.ts` now offers 12 Hafs reciters,
each confirmed by `pnpm verify:audio`. This is the only part deliverable with no
new data pipeline, and it directly answers "more reciters".

### Stage 1 — The riwayah data axis (schema + seeding)
- New reference list `reference/riwayat.ts`: `{ key, nameAr, countingSchool }`,
  with `hafs` (default) first. `Reciter` gains a `riwayah` key; existing reciters
  are tagged `hafs`.
- `Subscriber` gains `riwayah` (String, default `'hafs'`, with a comment listing
  allowed values — no Prisma enum, per project convention).
- Each riwayah needs its own seeded text. The Surah/Ayah tables are per-riwayah,
  OR (cleaner) add a `riwayah` column to `Ayah`/`Surah` and to `Track`/`TrackEntry`
  so a track belongs to a riwayah. A Warsh track is then "just seeded rows", the
  same way the two orders are today — but its text and ayah COUNT differ.
- A new fetch+verify script `scripts/fetch-quran-warsh.ts` mirroring
  `fetch-quran.ts`: download KFGQPC Warsh, verify the Madani per-surah counts and
  total (6214), cross-check against KSU, store at `prisma/data/quran-warsh.json`,
  update NOTICE.

### Stage 2 — Per-riwayah resolution at send time
- `resolveTargetEntry`, the tracks, and the audio/tafseer builders read the
  subscriber's `riwayah`. The audio CDN folder and the text both come from the
  riwayah. Tafseer: OFF for non-Hafs in the MVP (Stage 1 option a), with a note,
  until a numbering bridge exists.
- Reposition logic (`/surah`, `/order`) stays within the subscriber's riwayah.

### Stage 3 — UI (the maintainer's vision)
- A `/riwayah` picker (and a `/settings` shortcut). Picking a non-default riwayah
  warns that it changes the mushaf text and that the reciter must be re-chosen.
- `/reciter` filters to the chosen riwayah's reciters, with a one-line note
  ("القُرّاء المعروضون برواية ...").  Changing riwayah resets the reciter to that
  riwayah's default (or prompts for it).

### Stage 4 — Audio for the requested riwayat (the blocker)
Only attemptable once a trusted per-ayah audio set exists for a Warsh/Qaloon
reciter. Until then, a riwayah can ship "text-only" (recitation off) if desired,
but that misses the point for someone who wants to HEAR the riwayah, so Stage 4
is really the gating prerequisite for a satisfying release.

## Honest answer to the specific request
- **More Hafs reciters:** shipped (Stage 0).
- **Warsh / Qaloon text:** feasible and verifiable (KFGQPC + KSU); needs Stages 1–2.
- **Warsh via Asbahani + محمد إرشاد مربعي / أحمد ديبان / محمد عبدالكريم:** the
  text is the rarer Asbahani rasm and the audio is per-surah only — there is **no
  per-ayah audio** for them, so they cannot be delivered in the bot's one-ayah
  model today without first building verified ayah-level segmentation. This is
  the honest blocker to relay in the thread: the want is right, the per-ayah
  audio simply does not exist yet from a trusted source.

## Sources
- KFGQPC developer data — https://qurancomplex.gov.sa/quran-dev/
- KFGQPC Warsh app — https://qurancomplex.gov.sa/en/apps-warsh/
- KSU Electronic Mushaf — https://quran.ksu.edu.sa/
- AlQuran.cloud editions (Hafs only) — https://alquran.cloud/api
- Tanzil download (Hafs only) — https://tanzil.net/docs/download
- QUL / Tarteel — https://qul.tarteel.ai/
- Counting schools (Kufic 6236 vs Madani 6214) — islamweb fatwa 75878;
  https://ar.wikipedia.org/wiki/علم_عد_الآيات
- everyayah recitations list — https://everyayah.com/recitations_ayat.html
- Asbahani Warsh recordings (per-surah, archive.org) —
  https://archive.org/details/Quranwarchasbahani
- mp3quran.net (per-surah; has a Warsh-Asbahani category, أحمد ديبان) —
  https://www.mp3quran.net/eng/
