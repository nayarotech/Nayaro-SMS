-- DropForeignKey
ALTER TABLE `FeeRecurringPlan` DROP FOREIGN KEY `FeeRecurringPlan_sectionId_fkey`;

-- AddForeignKey
ALTER TABLE `FeeRecurringPlan` ADD CONSTRAINT `FeeRecurringPlan_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

