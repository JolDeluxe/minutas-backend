/*
  Warnings:

  - Added the required column `pdfUrl` to the `Tarea` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `tarea` ADD COLUMN `pdfUrl` TEXT NOT NULL;
