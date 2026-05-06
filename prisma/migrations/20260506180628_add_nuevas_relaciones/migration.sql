/*
  Warnings:

  - You are about to alter the column `estado` on the `minuta` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(4))` to `Enum(EnumId(5))`.
  - You are about to drop the column `isComplete` on the `tarea` table. All the data in the column will be lost.
  - Made the column `area` on table `tarea` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX `Tarea_isComplete_idx` ON `tarea`;

-- AlterTable
ALTER TABLE `minuta` MODIFY `estado` ENUM('ACTIVA', 'CERRADA') NOT NULL DEFAULT 'ACTIVA';

-- AlterTable
ALTER TABLE `tarea` DROP COLUMN `isComplete`,
    ADD COLUMN `capturaCompleta` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `area` ENUM('DISENO', 'DIRECCION_MBC', 'DIRECCION_CFI', 'DIRECCION_ADJUNTA', 'DIRECCION_TIENDAS') NOT NULL DEFAULT 'DISENO';

-- AlterTable
ALTER TABLE `usuario` ADD COLUMN `area` ENUM('DISENO', 'DIRECCION_MBC', 'DIRECCION_CFI', 'DIRECCION_ADJUNTA', 'DIRECCION_TIENDAS') NOT NULL DEFAULT 'DISENO',
    ADD COLUMN `linea` ENUM('CALZADO', 'BOTA', 'ROPA', 'ACCESORIOS') NULL;

-- CreateIndex
CREATE INDEX `Tarea_capturaCompleta_idx` ON `Tarea`(`capturaCompleta`);
