-- Consolidation review (مراجعة التثبيت / المراجعة البعيدة): each day, alongside
-- the new ayah, revisit a few previously-CONFIRMED ayat, rotating through the
-- whole memorized corpus so old material never slips.

-- AlterTable: how many old ayat to revisit per day (0 = off, default 3), and the
-- rotation index into the confirmed corpus (advances once per recorded day).
ALTER TABLE `subscribers`
    ADD COLUMN `old_review_count` INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN `review_cursor` INTEGER NOT NULL DEFAULT 0;
