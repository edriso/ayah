-- AlterTable: per-subscriber reciter choice for the daily ayah's recitation
-- audio. A reciter key (see src/database/reference/reciters.ts) or "none".
-- Defaults to the kids teacher style (الحصري المعلِّم), i.e. audio on by default.
ALTER TABLE `subscribers` ADD COLUMN `reciter` VARCHAR(32) NOT NULL DEFAULT 'husary-muallim';

-- CreateTable: the Telegram file_id cache for per-ayah recitation audio. We
-- never store the audio bytes; the first send fetches from the CDN and Telegram
-- returns a file_id, cached here and reused on later sends. Keyed by
-- (surah, ayah, reciter) so each reciter caches independently.
CREATE TABLE `ayah_audio` (
    `surah_number` INTEGER NOT NULL,
    `number_in_surah` INTEGER NOT NULL,
    `reciter` VARCHAR(32) NOT NULL,
    `file_id` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`surah_number`, `number_in_surah`, `reciter`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
