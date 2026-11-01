-- CreateTable
CREATE TABLE `FeeRecurringPlan` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `academicYearId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `sectionId` VARCHAR(191) NULL,
    `feeStructureId` VARCHAR(191) NOT NULL,
    `calendar` VARCHAR(191) NOT NULL,
    `billingDay` INTEGER NOT NULL,
    `dueDay` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FeeRecurringPlan_schoolId_name_key`(`schoolId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeeRecurringDiscount` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `discount` INTEGER NOT NULL,

    UNIQUE INDEX `FeeRecurringDiscount_planId_studentId_key`(`planId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeeRecurringRun` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `month` VARCHAR(191) NOT NULL,
    `issuedBy` VARCHAR(191) NOT NULL,
    `created` INTEGER NOT NULL,
    `skipped` INTEGER NOT NULL,
    `total` BIGINT NOT NULL,
    `billIds` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FeeRecurringRun_schoolId_createdAt_idx`(`schoolId`, `createdAt`),
    UNIQUE INDEX `FeeRecurringRun_planId_month_key`(`planId`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FeeRecurringPlan` ADD CONSTRAINT `FeeRecurringPlan_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeRecurringPlan` ADD CONSTRAINT `FeeRecurringPlan_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `AcademicYear`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeRecurringPlan` ADD CONSTRAINT `FeeRecurringPlan_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `SchoolClass`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeRecurringPlan` ADD CONSTRAINT `FeeRecurringPlan_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeRecurringPlan` ADD CONSTRAINT `FeeRecurringPlan_feeStructureId_fkey` FOREIGN KEY (`feeStructureId`) REFERENCES `FeeStructure`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeRecurringDiscount` ADD CONSTRAINT `FeeRecurringDiscount_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeRecurringDiscount` ADD CONSTRAINT `FeeRecurringDiscount_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `FeeRecurringPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeRecurringDiscount` ADD CONSTRAINT `FeeRecurringDiscount_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeRecurringRun` ADD CONSTRAINT `FeeRecurringRun_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeRecurringRun` ADD CONSTRAINT `FeeRecurringRun_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `FeeRecurringPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

