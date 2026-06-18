-- Read-gated ayah: the position advances only when the subscriber marks the
-- day's ayah DONE (the "أتممتُها" button or /next). Null until then; the ayah
-- repeats each day until it is set, and the count of unconfirmed "sent" rows
-- before today is the "days since last review" number.
ALTER TABLE `delivery_logs`
    ADD COLUMN `confirmed_at` DATETIME(3) NULL;
