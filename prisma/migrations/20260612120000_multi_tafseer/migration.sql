-- Multi-edition tafseer: a subscriber picks WHICH tafseer they receive, and
-- whether to get it as text or as a link. The single per-ayah column on `ayat`
-- becomes its own table keyed by (edition, surah, ayah) so every edition lives
-- side by side (modeled like `ayah_audio`). The old column is dropped; the
-- tafseer is reference data, re-seeded from the verified data files.

-- DropColumn: the old single (Al-Muyassar) tafseer column on each ayah.
ALTER TABLE `ayat` DROP COLUMN `tafseer`;

-- AlterTable: per-subscriber tafseer edition + delivery format.
-- tafseer_edition: an edition key (see src/database/reference/tafseers.ts);
-- defaults to التفسير الميسر. tafseer_format: "text" (inline, default) or
-- "link" (a pointer to read it in full).
ALTER TABLE `subscribers`
  ADD COLUMN `tafseer_edition` VARCHAR(32) NOT NULL DEFAULT 'muyassar',
  ADD COLUMN `tafseer_format` VARCHAR(8) NOT NULL DEFAULT 'text';

-- CreateTable: one row per (edition, ayah). For a concise edition `text` is the
-- full tafseer; for a long "preview" edition it is a bounded one-message
-- opening (the bot appends a "read full" link). Natural key, no FK to `ayat`,
-- so a new edition is just more rows. Fills from the seed, never from the bot.
CREATE TABLE `tafseer` (
    `edition` VARCHAR(32) NOT NULL,
    `surah_number` INTEGER NOT NULL,
    `number_in_surah` INTEGER NOT NULL,
    `text` TEXT NOT NULL,

    PRIMARY KEY (`edition`, `surah_number`, `number_in_surah`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
