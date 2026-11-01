-- AlterTable
ALTER TABLE `FeePayment` ADD COLUMN `reversalReason` TEXT NULL,
    ADD COLUMN `reversedAt` DATETIME(3) NULL,
    ADD COLUMN `reversedBy` VARCHAR(191) NULL;

