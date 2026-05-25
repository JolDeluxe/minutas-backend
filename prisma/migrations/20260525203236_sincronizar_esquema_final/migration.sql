/*
  Warnings:

  - You are about to drop the column `fecha` on the `minuta` table. All the data in the column will be lost.
  - You are about to alter the column `lineaDefault` on the `minuta` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(2))` to `VarChar(191)`.
  - The values [ENTRADA_FORMALIZADA,SEGUIMIENTO_ASIGNADO,SEGUIMIENTO_PROXIMO,NUEVAS_TAREAS] on the enum `Notificacion_tipo` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `capturaCompleta` on the `tarea` table. All the data in the column will be lost.
  - You are about to drop the column `estadoConceptual` on the `tarea` table. All the data in the column will be lost.
  - You are about to drop the column `estadoOperativo` on the `tarea` table. All the data in the column will be lost.
  - You are about to drop the column `fechaSeguimiento` on the `tarea` table. All the data in the column will be lost.
  - You are about to drop the column `formalizada` on the `tarea` table. All the data in the column will be lost.
  - You are about to drop the column `formalizadoAt` on the `tarea` table. All the data in the column will be lost.
  - You are about to drop the column `formalizadoPorId` on the `tarea` table. All the data in the column will be lost.
  - You are about to drop the column `isExternalArea` on the `tarea` table. All the data in the column will be lost.
  - You are about to drop the column `requiereSeguimiento` on the `tarea` table. All the data in the column will be lost.
  - You are about to alter the column `linea` on the `tarea` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(6))` to `VarChar(191)`.
  - You are about to alter the column `estado` on the `tarea` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(9))` to `Enum(EnumId(8))`.
  - You are about to drop the column `completadoAt` on the `tareaasignacion` table. All the data in the column will be lost.
  - You are about to drop the column `estado` on the `tareaasignacion` table. All the data in the column will be lost.
  - You are about to drop the column `tipo` on the `tareaasignacion` table. All the data in the column will be lost.
  - You are about to drop the column `area` on the `usuario` table. All the data in the column will be lost.
  - You are about to alter the column `linea` on the `usuario` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(14))` to `VarChar(191)`.
  - A unique constraint covering the columns `[tareaId,usuarioId]` on the table `TareaAsignacion` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fechaProgramada` to the `Minuta` table without a default value. This is not possible if the table is not empty.
  - Made the column `clasificacion` on table `tarea` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `tarea` DROP FOREIGN KEY `Tarea_formalizadoPorId_fkey`;

-- DropIndex
DROP INDEX `Minuta_fecha_idx` ON `minuta`;

-- DropIndex
DROP INDEX `Tarea_area_estado_idx` ON `tarea`;

-- DropIndex
DROP INDEX `Tarea_capturaCompleta_idx` ON `tarea`;

-- DropIndex
DROP INDEX `Tarea_estadoConceptual_idx` ON `tarea`;

-- DropIndex
DROP INDEX `Tarea_estadoOperativo_idx` ON `tarea`;

-- DropIndex
DROP INDEX `Tarea_fechaSeguimiento_estadoConceptual_idx` ON `tarea`;

-- DropIndex
DROP INDEX `Tarea_fechaSeguimiento_idx` ON `tarea`;

-- DropIndex
DROP INDEX `Tarea_formalizada_estadoOperativo_idx` ON `tarea`;

-- DropIndex
DROP INDEX `Tarea_formalizada_idx` ON `tarea`;

-- DropIndex
DROP INDEX `Tarea_isExternalArea_idx` ON `tarea`;

-- DropIndex
DROP INDEX `Tarea_minutaId_estado_idx` ON `tarea`;

-- DropIndex
DROP INDEX `Tarea_requiereSeguimiento_idx` ON `tarea`;

-- DropIndex
DROP INDEX `TareaAsignacion_estado_idx` ON `tareaasignacion`;

-- DropIndex
DROP INDEX `TareaAsignacion_tareaId_usuarioId_tipo_key` ON `tareaasignacion`;

-- DropIndex
DROP INDEX `TareaAsignacion_tipo_idx` ON `tareaasignacion`;

-- AlterTable
ALTER TABLE `minuta` DROP COLUMN `fecha`,
    ADD COLUMN `canceladoAt` DATETIME(3) NULL,
    ADD COLUMN `canceladoPorId` INTEGER NULL,
    ADD COLUMN `departamento` ENUM('DISENO', 'MARKETING') NOT NULL DEFAULT 'DISENO',
    ADD COLUMN `fechaProgramada` DATETIME(3) NOT NULL,
    ADD COLUMN `fechaRealizada` DATETIME(3) NULL,
    ADD COLUMN `minutaAnteriorId` INTEGER NULL,
    MODIFY `lineaDefault` VARCHAR(191) NULL,
    MODIFY `estado` ENUM('PROGRAMADA', 'EN_CURSO', 'EN_ORGANIZACION', 'ACTIVA', 'CERRADA', 'CANCELADA') NOT NULL DEFAULT 'PROGRAMADA';

-- AlterTable
ALTER TABLE `notificacion` MODIFY `tipo` ENUM('ENTRADA_CAPTURADA', 'ENTRADA_ORGANIZADA', 'ENTRADA_DESCARTADA', 'TAREA_ASIGNADA', 'TAREA_EN_REVISION', 'TAREA_COMPLETADA', 'TAREA_CERRADA', 'TAREA_CANCELADA', 'TAREA_MODIFICADA', 'RECORDATORIO_ASIGNADO', 'REVISION_PENDIENTE', 'VENCIMIENTO_PROXIMO', 'LINEA_CAMBIADA', 'NUEVAS_ENTRADAS') NOT NULL;

-- AlterTable
ALTER TABLE `tarea` DROP COLUMN `capturaCompleta`,
    DROP COLUMN `estadoConceptual`,
    DROP COLUMN `estadoOperativo`,
    DROP COLUMN `fechaSeguimiento`,
    DROP COLUMN `formalizada`,
    DROP COLUMN `formalizadoAt`,
    DROP COLUMN `formalizadoPorId`,
    DROP COLUMN `isExternalArea`,
    DROP COLUMN `requiereSeguimiento`,
    ADD COLUMN `alcanceRecordatorio` ENUM('DEPARTAMENTO', 'PERSONAL') NULL,
    ADD COLUMN `departamento` ENUM('DISENO', 'MARKETING') NOT NULL DEFAULT 'DISENO',
    ADD COLUMN `organizadoAt` DATETIME(3) NULL,
    ADD COLUMN `organizadoPorId` INTEGER NULL,
    ADD COLUMN `tipo` ENUM('SIN_ORGANIZAR', 'TAREA', 'RECORDATORIO', 'POLITICA', 'DESCARTADA') NOT NULL DEFAULT 'SIN_ORGANIZAR',
    MODIFY `area` ENUM('DISENO', 'MARKETING', 'DIRECCION_MBC', 'DIRECCION_CFI', 'DIRECCION_ADJUNTA', 'DIRECCION_TIENDAS') NOT NULL DEFAULT 'DISENO',
    MODIFY `linea` VARCHAR(191) NULL,
    MODIFY `clasificacion` VARCHAR(191) NOT NULL,
    MODIFY `estado` ENUM('PENDIENTE', 'EN_REVISION', 'CERRADA', 'CANCELADA', 'DESCARTADA') NULL;

-- AlterTable
ALTER TABLE `tareaasignacion` DROP COLUMN `completadoAt`,
    DROP COLUMN `estado`,
    DROP COLUMN `tipo`;

-- AlterTable
ALTER TABLE `usuario` DROP COLUMN `area`,
    ADD COLUMN `departamento` ENUM('DISENO', 'MARKETING') NULL,
    ADD COLUMN `dummyClasificacion` VARCHAR(191) NULL,
    MODIFY `rol` ENUM('ADMIN', 'GERENCIA', 'JEFE', 'COORDINADOR') NOT NULL DEFAULT 'COORDINADOR',
    MODIFY `linea` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Minuta_fechaProgramada_idx` ON `Minuta`(`fechaProgramada`);

-- CreateIndex
CREATE INDEX `Minuta_fechaRealizada_idx` ON `Minuta`(`fechaRealizada`);

-- CreateIndex
CREATE INDEX `Minuta_lineaDefault_idx` ON `Minuta`(`lineaDefault`);

-- CreateIndex
CREATE INDEX `Minuta_minutaAnteriorId_idx` ON `Minuta`(`minutaAnteriorId`);

-- CreateIndex
CREATE INDEX `Tarea_tipo_idx` ON `Tarea`(`tipo`);

-- CreateIndex
CREATE INDEX `Tarea_departamento_idx` ON `Tarea`(`departamento`);

-- CreateIndex
CREATE INDEX `Tarea_linea_idx` ON `Tarea`(`linea`);

-- CreateIndex
CREATE INDEX `Tarea_clasificacion_idx` ON `Tarea`(`clasificacion`);

-- CreateIndex
CREATE INDEX `Tarea_organizadoPorId_idx` ON `Tarea`(`organizadoPorId`);

-- CreateIndex
CREATE INDEX `Tarea_minutaId_tipo_idx` ON `Tarea`(`minutaId`, `tipo`);

-- CreateIndex
CREATE INDEX `Tarea_tipo_estado_idx` ON `Tarea`(`tipo`, `estado`);

-- CreateIndex
CREATE INDEX `Tarea_departamento_tipo_idx` ON `Tarea`(`departamento`, `tipo`);

-- CreateIndex
CREATE INDEX `Tarea_alcanceRecordatorio_idx` ON `Tarea`(`alcanceRecordatorio`);

-- CreateIndex
CREATE UNIQUE INDEX `TareaAsignacion_tareaId_usuarioId_key` ON `TareaAsignacion`(`tareaId`, `usuarioId`);

-- AddForeignKey
ALTER TABLE `Minuta` ADD CONSTRAINT `Minuta_canceladoPorId_fkey` FOREIGN KEY (`canceladoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Minuta` ADD CONSTRAINT `Minuta_minutaAnteriorId_fkey` FOREIGN KEY (`minutaAnteriorId`) REFERENCES `Minuta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tarea` ADD CONSTRAINT `Tarea_organizadoPorId_fkey` FOREIGN KEY (`organizadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
