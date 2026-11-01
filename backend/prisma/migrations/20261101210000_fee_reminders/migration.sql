-- CreateTable
CREATE TABLE `FeeReminder` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `billId` VARCHAR(191) NOT NULL,
    `recipientUserId` VARCHAR(191) NOT NULL,
    `recipientName` VARCHAR(191) NOT NULL,
    `reminderDay` DATE NOT NULL,
    `balance` INTEGER NOT NULL,
    `sentBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FeeReminder_schoolId_billId_createdAt_idx`(`schoolId`, `billId`, `createdAt`),
    UNIQUE INDEX `FeeReminder_schoolId_billId_recipientUserId_reminderDay_key`(`schoolId`, `billId`, `recipientUserId`, `reminderDay`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FeeReminder` ADD CONSTRAINT `FeeReminder_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeReminder` ADD CONSTRAINT `FeeReminder_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `FeeBill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

