-- CreateTable
CREATE TABLE `surahs` (
    `number` INTEGER NOT NULL,
    `nameAr` VARCHAR(64) NOT NULL,
    `nameEn` VARCHAR(64) NOT NULL,
    `revelation` VARCHAR(16) NOT NULL,
    `ayah_count` INTEGER NOT NULL,

    PRIMARY KEY (`number`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ayat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `surah_number` INTEGER NOT NULL,
    `number_in_surah` INTEGER NOT NULL,
    `text` TEXT NOT NULL,

    UNIQUE INDEX `ayat_surah_number_in_surah_key`(`surah_number`, `number_in_surah`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tracks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(48) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `loops` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `tracks_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `track_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `track_id` INTEGER NOT NULL,
    `position` INTEGER NOT NULL,
    `ayah_id` INTEGER NOT NULL,

    UNIQUE INDEX `track_entries_track_position_key`(`track_id`, `position`),
    UNIQUE INDEX `track_entries_track_ayah_key`(`track_id`, `ayah_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscribers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `telegram_id` BIGINT NOT NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'ar',
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Africa/Cairo',
    `delivery_hour` TINYINT NOT NULL DEFAULT 7,
    `delivery_minute` TINYINT NOT NULL DEFAULT 0,
    `active_days` INTEGER NOT NULL DEFAULT 127,
    `review_count` INTEGER NOT NULL DEFAULT 10,
    `track_id` INTEGER NOT NULL,
    `current_entry_id` INTEGER NULL,
    `paused_at` DATETIME(3) NULL,
    `blocked_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscribers_telegram_id_key`(`telegram_id`),
    INDEX `subscribers_track_id_idx`(`track_id`),
    INDEX `subscribers_paused_at_blocked_at_idx`(`paused_at`, `blocked_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subscriber_id` INTEGER NOT NULL,
    `track_entry_id` INTEGER NOT NULL,
    `scheduled_for` VARCHAR(10) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'sent',
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `delivery_logs_subscriber_id_created_at_idx`(`subscriber_id`, `created_at`),
    UNIQUE INDEX `delivery_logs_subscriber_date_key`(`subscriber_id`, `scheduled_for`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cron_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finished_at` DATETIME(3) NULL,
    `success` BOOLEAN NOT NULL DEFAULT false,
    `duration_ms` INTEGER NULL,
    `stats_json` TEXT NULL,
    `error_message` TEXT NULL,

    INDEX `cron_runs_name_started_at_idx`(`name`, `started_at` DESC),
    INDEX `cron_runs_started_at_idx`(`started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ayat` ADD CONSTRAINT `ayat_surah_number_fkey` FOREIGN KEY (`surah_number`) REFERENCES `surahs`(`number`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `track_entries` ADD CONSTRAINT `track_entries_track_id_fkey` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `track_entries` ADD CONSTRAINT `track_entries_ayah_id_fkey` FOREIGN KEY (`ayah_id`) REFERENCES `ayat`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscribers` ADD CONSTRAINT `subscribers_track_id_fkey` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscribers` ADD CONSTRAINT `subscribers_current_entry_id_fkey` FOREIGN KEY (`current_entry_id`) REFERENCES `track_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_logs` ADD CONSTRAINT `delivery_logs_subscriber_id_fkey` FOREIGN KEY (`subscriber_id`) REFERENCES `subscribers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_logs` ADD CONSTRAINT `delivery_logs_track_entry_id_fkey` FOREIGN KEY (`track_entry_id`) REFERENCES `track_entries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
