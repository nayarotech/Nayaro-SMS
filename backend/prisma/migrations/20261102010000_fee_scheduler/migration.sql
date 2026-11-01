-- AlterTable
ALTER TABLE `FeeRecurringPlan` ADD COLUMN `automationAmount` INTEGER NULL,
    ADD COLUMN `automationEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `automationEnabledBy` VARCHAR(191) NULL,
    ADD COLUMN `automationStartDate` DATE NULL;

-- AlterTable
ALTER TABLE `FeeRecurringRun` ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE `FeeScheduleState` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `month` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `leaseToken` VARCHAR(191) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `nextAttemptAt` DATETIME(3) NULL,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` TEXT NULL,
    `failureAlertAt` DATETIME(3) NULL,
    `runId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FeeScheduleState_schoolId_updatedAt_idx`(`schoolId`, `updatedAt`),
    UNIQUE INDEX `FeeScheduleState_planId_month_key`(`planId`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FeeScheduleState` ADD CONSTRAINT `FeeScheduleState_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeScheduleState` ADD CONSTRAINT `FeeScheduleState_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `FeeRecurringPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

