/*
  Warnings:

  - The values [TAREA_INICIADA] on the enum `Notificacion_tipo` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `notificacion` MODIFY `tipo` ENUM('NUEVAS_TAREAS', 'TAREA_ASIGNADA', 'TAREA_COMPLETADA', 'TAREA_CERRADA', 'TAREA_MODIFICADA', 'REVISION_PENDIENTE', 'VENCIMIENTO_PROXIMO', 'LINEA_CAMBIADA') NOT NULL;
