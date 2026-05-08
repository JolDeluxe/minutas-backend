/*
  Warnings:

  - A unique constraint covering the columns `[tareaId,usuarioId,tipo]` on the table `TareaAsignacion` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX `TareaAsignacion_tareaId_usuarioId_key` ON `tareaasignacion`;

-- AlterTable
ALTER TABLE `minuta` ADD COLUMN `cerradoAt` DATETIME(3) NULL,
    ADD COLUMN `cerradoPorId` INTEGER NULL;

-- AlterTable
ALTER TABLE `notageneral` ADD COLUMN `creadoPorId` INTEGER NULL;

-- AlterTable
ALTER TABLE `notificacion` MODIFY `tipo` ENUM('ENTRADA_CAPTURADA', 'ENTRADA_FORMALIZADA', 'ENTRADA_DESCARTADA', 'SEGUIMIENTO_ASIGNADO', 'SEGUIMIENTO_PROXIMO', 'NUEVAS_TAREAS', 'TAREA_ASIGNADA', 'TAREA_COMPLETADA', 'TAREA_CERRADA', 'TAREA_MODIFICADA', 'REVISION_PENDIENTE', 'VENCIMIENTO_PROXIMO', 'LINEA_CAMBIADA') NOT NULL;

-- AlterTable
ALTER TABLE `tarea` ADD COLUMN `estadoConceptual` ENUM('CAPTURADO', 'EN_REVISION', 'CERRADO', 'DESCARTADO') NOT NULL DEFAULT 'CAPTURADO',
    ADD COLUMN `estadoOperativo` ENUM('PENDIENTE', 'EN_PROGRESO', 'COMPLETADO') NULL,
    ADD COLUMN `fechaSeguimiento` DATETIME(3) NULL,
    ADD COLUMN `formalizada` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `formalizadoAt` DATETIME(3) NULL,
    ADD COLUMN `formalizadoPorId` INTEGER NULL,
    ADD COLUMN `requiereSeguimiento` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `prioridad` ENUM('BAJA', 'MEDIA', 'ALTA', 'CRITICA') NULL,
    MODIFY `clasificacion` ENUM('IDEA', 'OBSERVACION', 'ACUERDO', 'INVESTIGACION', 'CORRECCION', 'ANALISIS', 'MUESTRA', 'SEGUIMIENTO', 'SOLICITUD', 'POLITICAS', 'TAREA', 'OTROS') NULL;

-- AlterTable
ALTER TABLE `tareaasignacion` ADD COLUMN `asignadoPorId` INTEGER NULL,
    ADD COLUMN `tipo` ENUM('SEGUIMIENTO', 'EJECUTOR') NOT NULL DEFAULT 'EJECUTOR';

-- AlterTable
ALTER TABLE `tareahistorial` ADD COLUMN `metadata` JSON NULL,
    ADD COLUMN `tipo` ENUM('CAPTURA', 'ACTUALIZACION', 'REVISION', 'FORMALIZACION', 'ASIGNACION', 'CAMBIO_ESTADO', 'CIERRE', 'DESCARTE', 'COMENTARIO', 'ADJUNTO') NOT NULL DEFAULT 'ACTUALIZACION';

-- AlterTable
ALTER TABLE `tareanota` ADD COLUMN `creadoPorId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `Minuta_cerradoPorId_idx` ON `Minuta`(`cerradoPorId`);

-- CreateIndex
CREATE INDEX `NotaGeneral_creadoPorId_idx` ON `NotaGeneral`(`creadoPorId`);

-- CreateIndex
CREATE INDEX `Tarea_estadoConceptual_idx` ON `Tarea`(`estadoConceptual`);

-- CreateIndex
CREATE INDEX `Tarea_estadoOperativo_idx` ON `Tarea`(`estadoOperativo`);

-- CreateIndex
CREATE INDEX `Tarea_formalizada_idx` ON `Tarea`(`formalizada`);

-- CreateIndex
CREATE INDEX `Tarea_requiereSeguimiento_idx` ON `Tarea`(`requiereSeguimiento`);

-- CreateIndex
CREATE INDEX `Tarea_fechaSeguimiento_idx` ON `Tarea`(`fechaSeguimiento`);

-- CreateIndex
CREATE INDEX `Tarea_formalizadoPorId_idx` ON `Tarea`(`formalizadoPorId`);

-- CreateIndex
CREATE INDEX `Tarea_formalizada_estadoOperativo_idx` ON `Tarea`(`formalizada`, `estadoOperativo`);

-- CreateIndex
CREATE INDEX `Tarea_fechaSeguimiento_estadoConceptual_idx` ON `Tarea`(`fechaSeguimiento`, `estadoConceptual`);

-- CreateIndex
CREATE INDEX `TareaAsignacion_asignadoPorId_idx` ON `TareaAsignacion`(`asignadoPorId`);

-- CreateIndex
CREATE INDEX `TareaAsignacion_tipo_idx` ON `TareaAsignacion`(`tipo`);

-- CreateIndex
CREATE UNIQUE INDEX `TareaAsignacion_tareaId_usuarioId_tipo_key` ON `TareaAsignacion`(`tareaId`, `usuarioId`, `tipo`);

-- CreateIndex
CREATE INDEX `TareaHistorial_tipo_idx` ON `TareaHistorial`(`tipo`);

-- CreateIndex
CREATE INDEX `TareaNota_creadoPorId_idx` ON `TareaNota`(`creadoPorId`);

-- AddForeignKey
ALTER TABLE `Minuta` ADD CONSTRAINT `Minuta_cerradoPorId_fkey` FOREIGN KEY (`cerradoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotaGeneral` ADD CONSTRAINT `NotaGeneral_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tarea` ADD CONSTRAINT `Tarea_formalizadoPorId_fkey` FOREIGN KEY (`formalizadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TareaNota` ADD CONSTRAINT `TareaNota_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TareaAsignacion` ADD CONSTRAINT `TareaAsignacion_asignadoPorId_fkey` FOREIGN KEY (`asignadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
