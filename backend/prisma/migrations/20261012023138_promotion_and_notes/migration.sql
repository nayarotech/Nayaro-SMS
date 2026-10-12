-- AlterTable
ALTER TABLE `Enrollment` MODIFY `status` ENUM('ACTIVE', 'PROMOTED', 'DETAINED', 'TRANSFERRED', 'LEFT', 'GRADUATED', 'COMPLETED') NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE `PromotionRun` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `fromYearId` VARCHAR(191) NOT NULL,
    `toYearId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `examId` VARCHAR(191) NULL,
    `rollNumbers` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `undoneAt` DATETIME(3) NULL,
    `undoneById` VARCHAR(191) NULL,

    INDEX `PromotionRun_schoolId_fromYearId_idx`(`schoolId`, `fromYearId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PromotionDecision` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `outcome` ENUM('PROMOTE', 'DETAIN', 'GRADUATE', 'LEAVE') NOT NULL,
    `fromEnrollmentId` VARCHAR(191) NOT NULL,
    `toEnrollmentId` VARCHAR(191) NULL,
    `suggested` ENUM('PROMOTE', 'DETAIN', 'GRADUATE', 'LEAVE') NULL,
    `reason` VARCHAR(500) NULL,
    `previousStudentStatus` ENUM('ACTIVE', 'LEFT', 'TRANSFERRED', 'GRADUATED') NOT NULL,

    UNIQUE INDEX `PromotionDecision_toEnrollmentId_key`(`toEnrollmentId`),
    INDEX `PromotionDecision_studentId_idx`(`studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentNote` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `category` ENUM('ACHIEVEMENT', 'DISCIPLINE', 'COUNSELLING', 'HEALTH', 'GENERAL') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NULL,
    `date` DATE NOT NULL,
    `sharedWithParents` BOOLEAN NOT NULL DEFAULT false,
    `authorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StudentNote_studentId_date_idx`(`studentId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PromotionRun` ADD CONSTRAINT `PromotionRun_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PromotionRun` ADD CONSTRAINT `PromotionRun_fromYearId_fkey` FOREIGN KEY (`fromYearId`) REFERENCES `AcademicYear`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PromotionRun` ADD CONSTRAINT `PromotionRun_toYearId_fkey` FOREIGN KEY (`toYearId`) REFERENCES `AcademicYear`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PromotionRun` ADD CONSTRAINT `PromotionRun_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `SchoolClass`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PromotionDecision` ADD CONSTRAINT `PromotionDecision_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `PromotionRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PromotionDecision` ADD CONSTRAINT `PromotionDecision_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PromotionDecision` ADD CONSTRAINT `PromotionDecision_fromEnrollmentId_fkey` FOREIGN KEY (`fromEnrollmentId`) REFERENCES `Enrollment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentNote` ADD CONSTRAINT `StudentNote_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentNote` ADD CONSTRAINT `StudentNote_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentNote` ADD CONSTRAINT `StudentNote_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
