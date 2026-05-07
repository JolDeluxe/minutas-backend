-- CreateTable
CREATE TABLE `Notificacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` ENUM('NUEVAS_TAREAS', 'TAREA_ASIGNADA', 'TAREA_INICIADA', 'TAREA_COMPLETADA', 'TAREA_CERRADA', 'TAREA_MODIFICADA', 'REVISION_PENDIENTE', 'VENCIMIENTO_PROXIMO', 'LINEA_CAMBIADA') NOT NULL,
    `titulo` VARCHAR(150) NOT NULL,
    `cuerpo` TEXT NOT NULL,
    `leida` BOOLEAN NOT NULL DEFAULT false,
    `accionada` BOOLEAN NOT NULL DEFAULT false,
    `usuarioId` INTEGER NOT NULL,
    `tareaId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notificacion_usuarioId_idx`(`usuarioId`),
    INDEX `Notificacion_leida_idx`(`leida`),
    INDEX `Notificacion_tareaId_idx`(`tareaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PushSubscription` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `endpoint` VARCHAR(500) NOT NULL,
    `p256dh` VARCHAR(300) NOT NULL,
    `auth` VARCHAR(100) NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `lastSuccess` DATETIME(3) NULL,
    `failureCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PushSubscription_endpoint_key`(`endpoint`),
    INDEX `PushSubscription_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Notificacion` ADD CONSTRAINT `Notificacion_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notificacion` ADD CONSTRAINT `Notificacion_tareaId_fkey` FOREIGN KEY (`tareaId`) REFERENCES `Tarea`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PushSubscription` ADD CONSTRAINT `PushSubscription_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
