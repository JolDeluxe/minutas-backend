/*
  Warnings:

  - The values [OBSERVACION,ACUERDO,SEGUIMIENTO,SOLICITUD,TAREA] on the enum `Tarea_clasificacion` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `tarea` MODIFY `clasificacion` ENUM('IDEA', 'INVESTIGACION', 'CORRECCION', 'ANALISIS', 'MUESTRA', 'POLITICAS', 'OTROS') NULL;
