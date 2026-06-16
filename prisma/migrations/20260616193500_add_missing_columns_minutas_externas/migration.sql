-- AlterTable
ALTER TABLE `minutaexterna` ADD COLUMN `fechaProgramada` DATETIME(3) NULL,
    ADD COLUMN `resumenTemas` TEXT NULL,
    ADD COLUMN `resumenAcuerdos` TEXT NULL,
    ADD COLUMN `resumenProximosPasos` TEXT NULL;
