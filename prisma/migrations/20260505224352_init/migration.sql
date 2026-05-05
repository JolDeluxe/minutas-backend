-- CreateTable
CREATE TABLE `Usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `username` VARCHAR(60) NOT NULL,
    `email` VARCHAR(150) NULL,
    `password` VARCHAR(255) NOT NULL,
    `imagen` VARCHAR(500) NULL,
    `rol` ENUM('GERENCIA', 'JEFE', 'COORDINADOR') NOT NULL DEFAULT 'COORDINADOR',
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Usuario_username_key`(`username`),
    UNIQUE INDEX `Usuario_email_key`(`email`),
    INDEX `Usuario_rol_idx`(`rol`),
    INDEX `Usuario_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Minuta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `titulo` VARCHAR(200) NOT NULL,
    `lineaDefault` ENUM('CALZADO', 'BOTA', 'ROPA', 'ACCESORIOS') NOT NULL,
    `estado` ENUM('ABIERTA', 'CERRADA') NOT NULL DEFAULT 'ABIERTA',
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creadoPorId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Minuta_creadoPorId_idx`(`creadoPorId`),
    INDEX `Minuta_estado_idx`(`estado`),
    INDEX `Minuta_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tarea` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `descripcion` TEXT NOT NULL,
    `area` ENUM('DISENO', 'DIRECCION_MBC', 'DIRECCION_CFI', 'DIRECCION_ADJUNTA', 'DIRECCION_TIENDAS') NULL,
    `prioridad` ENUM('BAJA', 'MEDIA', 'CRITICA') NULL,
    `linea` ENUM('CALZADO', 'BOTA', 'ROPA', 'ACCESORIOS') NULL,
    `clasificacion` ENUM('INVESTIGACION', 'CORRECCION', 'ANALISIS', 'MUESTRA', 'POLITICAS', 'OTROS') NULL,
    `fechaVencimiento` DATETIME(3) NULL,
    `estado` ENUM('PENDIENTE', 'EN_PROGRESO', 'COMPLETADO', 'CERRADO') NOT NULL DEFAULT 'PENDIENTE',
    `completadoAt` DATETIME(3) NULL,
    `cerradoAt` DATETIME(3) NULL,
    `isExternalArea` BOOLEAN NOT NULL DEFAULT false,
    `isComplete` BOOLEAN NOT NULL DEFAULT false,
    `minutaId` INTEGER NULL,
    `creadoPorId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Tarea_minutaId_idx`(`minutaId`),
    INDEX `Tarea_estado_idx`(`estado`),
    INDEX `Tarea_area_idx`(`area`),
    INDEX `Tarea_isExternalArea_idx`(`isExternalArea`),
    INDEX `Tarea_isComplete_idx`(`isComplete`),
    INDEX `Tarea_fechaVencimiento_idx`(`fechaVencimiento`),
    INDEX `Tarea_creadoPorId_idx`(`creadoPorId`),
    INDEX `Tarea_minutaId_estado_idx`(`minutaId`, `estado`),
    INDEX `Tarea_area_estado_idx`(`area`, `estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TareaAsignacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `estado` ENUM('PENDIENTE', 'EN_PROGRESO', 'COMPLETADO') NOT NULL DEFAULT 'PENDIENTE',
    `completadoAt` DATETIME(3) NULL,
    `tareaId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TareaAsignacion_tareaId_idx`(`tareaId`),
    INDEX `TareaAsignacion_usuarioId_idx`(`usuarioId`),
    INDEX `TareaAsignacion_estado_idx`(`estado`),
    UNIQUE INDEX `TareaAsignacion_tareaId_usuarioId_key`(`tareaId`, `usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TareaImagen` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `url` VARCHAR(500) NOT NULL,
    `publicId` VARCHAR(300) NOT NULL,
    `orden` INTEGER NOT NULL,
    `tareaId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TareaImagen_tareaId_idx`(`tareaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TareaHistorial` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campo` VARCHAR(100) NOT NULL,
    `valorAntes` TEXT NULL,
    `valorDespues` TEXT NULL,
    `tareaId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TareaHistorial_tareaId_idx`(`tareaId`),
    INDEX `TareaHistorial_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Bitacora` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accion` VARCHAR(100) NOT NULL,
    `detalles` TEXT NULL,
    `usuarioId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Bitacora_usuarioId_idx`(`usuarioId`),
    INDEX `Bitacora_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `hashedToken` VARCHAR(255) NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `revoked` BOOLEAN NOT NULL DEFAULT false,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RefreshToken_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_token_key`(`token`),
    INDEX `PasswordResetToken_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Minuta` ADD CONSTRAINT `Minuta_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tarea` ADD CONSTRAINT `Tarea_minutaId_fkey` FOREIGN KEY (`minutaId`) REFERENCES `Minuta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tarea` ADD CONSTRAINT `Tarea_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TareaAsignacion` ADD CONSTRAINT `TareaAsignacion_tareaId_fkey` FOREIGN KEY (`tareaId`) REFERENCES `Tarea`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TareaAsignacion` ADD CONSTRAINT `TareaAsignacion_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TareaImagen` ADD CONSTRAINT `TareaImagen_tareaId_fkey` FOREIGN KEY (`tareaId`) REFERENCES `Tarea`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TareaHistorial` ADD CONSTRAINT `TareaHistorial_tareaId_fkey` FOREIGN KEY (`tareaId`) REFERENCES `Tarea`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TareaHistorial` ADD CONSTRAINT `TareaHistorial_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bitacora` ADD CONSTRAINT `Bitacora_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
