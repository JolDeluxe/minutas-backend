-- CreateTable
CREATE TABLE `NotaGeneral` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contenido` TEXT NOT NULL,
    `imagenUrl` VARCHAR(500) NULL,
    `publicId` VARCHAR(300) NULL,
    `minutaId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NotaGeneral_minutaId_idx`(`minutaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TareaNota` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contenido` TEXT NOT NULL,
    `imagenUrl` VARCHAR(500) NULL,
    `publicId` VARCHAR(300) NULL,
    `tareaId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TareaNota_tareaId_idx`(`tareaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `NotaGeneral` ADD CONSTRAINT `NotaGeneral_minutaId_fkey` FOREIGN KEY (`minutaId`) REFERENCES `Minuta`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TareaNota` ADD CONSTRAINT `TareaNota_tareaId_fkey` FOREIGN KEY (`tareaId`) REFERENCES `Tarea`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
