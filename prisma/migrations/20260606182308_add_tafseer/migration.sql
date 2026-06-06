-- AlterTable: add the seeded tafseer text to each ayah (nullable; seeded once
-- from prisma/data/tafseer-muyassar.json and never written to by the bot).
ALTER TABLE `ayat` ADD COLUMN `tafseer` TEXT NULL;

-- AlterTable: per-subscriber toggle for following the daily ayah with its
-- tafseer as a silent message. On by default.
ALTER TABLE `subscribers` ADD COLUMN `tafseer_enabled` BOOLEAN NOT NULL DEFAULT true;
