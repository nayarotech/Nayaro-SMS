-- DropForeignKey
ALTER TABLE `FeeReminder` DROP FOREIGN KEY `FeeReminder_schoolId_fkey`;

-- DropIndex
DROP INDEX `FeeReminder_schoolId_billId_recipientUserId_reminderDay_key` ON `FeeReminder`;

-- AlterTable
ALTER TABLE `FeeReminder` ADD COLUMN `channel` VARCHAR(191) NOT NULL DEFAULT 'IN_APP',
    ADD COLUMN `deliveryStatus` VARCHAR(191) NOT NULL DEFAULT 'RECORDED',
    ADD COLUMN `errorCode` VARCHAR(191) NULL,
    ADD COLUMN `message` TEXT NULL,
    ADD COLUMN `phone` VARCHAR(191) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX `FeeReminder_daily_channel_key` ON `FeeReminder`(`schoolId`, `billId`, `recipientUserId`, `reminderDay`, `channel`);

-- AddForeignKey
ALTER TABLE `FeeReminder` ADD CONSTRAINT `FeeReminder_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

