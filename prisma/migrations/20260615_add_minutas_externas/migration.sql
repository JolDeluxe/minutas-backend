-- CreateTable MinutaExterna
CREATE TABLE IF NOT EXISTS `minutaexterna` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tema` VARCHAR(200) NOT NULL,
    `area` ENUM('DISENO', 'MARKETING', 'DIRECCION_MBC', 'DIRECCION_CFI', 'DIRECCION_ADJUNTA', 'DIRECCION_TIENDAS', 'DIRECCION_MKT', 'DIRECCION_ALTA_CALIDAD', 'OTRA') NOT NULL DEFAULT 'DIRECCION_MBC',
    `departamento` VARCHAR(100) NULL,
    `objetivo` TEXT NULL,
    `integrantes` TEXT NULL,
    `asistentes` TEXT NULL,
    `estado` ENUM('ACTIVA', 'CERRADA', 'CANCELADA') NOT NULL DEFAULT 'ACTIVA',
    `creadoPorId` INTEGER NOT NULL,
    `cerradoPorId` INTEGER NULL,
    `cerradoAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MinutaExterna_creadoPorId_idx`(`creadoPorId` ASC),
    INDEX `MinutaExterna_area_idx`(`area` ASC),
    INDEX `MinutaExterna_estado_idx`(`estado` ASC),
    INDEX `MinutaExterna_createdAt_idx`(`createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable TareaExterna
CREATE TABLE IF NOT EXISTS `tareaexterna` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `descripcion` TEXT NOT NULL,
    `area` ENUM('DISENO', 'MARKETING', 'DIRECCION_MBC', 'DIRECCION_CFI', 'DIRECCION_ADJUNTA', 'DIRECCION_TIENDAS', 'DIRECCION_MKT', 'DIRECCION_ALTA_CALIDAD', 'OTRA') NOT NULL DEFAULT 'DIRECCION_MBC',
    `departamento` VARCHAR(100) NULL,
    `estado` ENUM('PENDIENTE', 'EN_REVISION', 'CERRADA', 'CANCELADA', 'DESCARTADA') NULL DEFAULT 'PENDIENTE',
    `prioridad` ENUM('BAJA', 'MEDIA', 'ALTA', 'CRITICA') NULL,
    `fechaVencimiento` DATETIME(3) NULL,
    `completadoAt` DATETIME(3) NULL,
    `cerradoAt` DATETIME(3) NULL,
    `notificadoAt` DATETIME(3) NULL,
    `pdfUrl` TEXT NULL,
    `minutaExternaId` INTEGER NOT NULL,
    `creadoPorId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TareaExterna_minutaExternaId_idx`(`minutaExternaId` ASC),
    INDEX `TareaExterna_estado_idx`(`estado` ASC),
    INDEX `TareaExterna_area_idx`(`area` ASC),
    INDEX `TareaExterna_fechaVencimiento_idx`(`fechaVencimiento` ASC),
    INDEX `TareaExterna_creadoPorId_idx`(`creadoPorId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable TareaExternaImagen
CREATE TABLE IF NOT EXISTS `tareaexternaimagen` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `url` VARCHAR(500) NOT NULL,
    `publicId` VARCHAR(300) NOT NULL,
    `orden` INTEGER NOT NULL,
    `tipo` ENUM('CAPTURA', 'EVIDENCIA') NOT NULL DEFAULT 'CAPTURA',
    `tareaExternaId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TareaExternaImagen_tareaExternaId_idx`(`tareaExternaId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable TareaExternaNota
CREATE TABLE IF NOT EXISTS `tareaexternanota` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contenido` TEXT NOT NULL,
    `esEntrega` BOOLEAN NOT NULL DEFAULT false,
    `tareaExternaId` INTEGER NOT NULL,
    `creadoPorId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TareaExternaNota_tareaExternaId_idx`(`tareaExternaId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey MinutaExterna → Usuario (creador)
ALTER TABLE `minutaexterna` ADD CONSTRAINT `MinutaExterna_creadoPorId_fkey`
    FOREIGN KEY (`creadoPorId`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey MinutaExterna → Usuario (cerrador)
ALTER TABLE `minutaexterna` ADD CONSTRAINT `MinutaExterna_cerradoPorId_fkey`
    FOREIGN KEY (`cerradoPorId`) REFERENCES `usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey TareaExterna → MinutaExterna
ALTER TABLE `tareaexterna` ADD CONSTRAINT `TareaExterna_minutaExternaId_fkey`
    FOREIGN KEY (`minutaExternaId`) REFERENCES `minutaexterna`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey TareaExterna → Usuario (creador)
ALTER TABLE `tareaexterna` ADD CONSTRAINT `TareaExterna_creadoPorId_fkey`
    FOREIGN KEY (`creadoPorId`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey TareaExternaImagen → TareaExterna
ALTER TABLE `tareaexternaimagen` ADD CONSTRAINT `TareaExternaImagen_tareaExternaId_fkey`
    FOREIGN KEY (`tareaExternaId`) REFERENCES `tareaexterna`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey TareaExternaNota → TareaExterna
ALTER TABLE `tareaexternanota` ADD CONSTRAINT `TareaExternaNota_tareaExternaId_fkey`
    FOREIGN KEY (`tareaExternaId`) REFERENCES `tareaexterna`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey TareaExternaNota → Usuario (creador)
ALTER TABLE `tareaexternanota` ADD CONSTRAINT `TareaExternaNota_creadoPorId_fkey`
    FOREIGN KEY (`creadoPorId`) REFERENCES `usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
