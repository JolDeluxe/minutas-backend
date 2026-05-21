import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando migración manual de datos...");

  // 1. Agregar las nuevas columnas temporalmente para que el UPDATE no falle
  console.log("1. Agregando nuevas columnas y modificando enum temporales...");
  try {
    // Convertir temporalmente a VARCHAR para evitar conflictos de enum al actualizar (CERRADO vs CERRADA)
    await prisma.$executeRawUnsafe(`ALTER TABLE Tarea MODIFY COLUMN estado VARCHAR(191) NULL;`);
    
    // Si ya existieran, esto puede fallar, pero está bien intentar.
    await prisma.$executeRawUnsafe(`ALTER TABLE Tarea ADD COLUMN tipo VARCHAR(191) NOT NULL DEFAULT 'SIN_ORGANIZAR';`);
    await prisma.$executeRawUnsafe(`ALTER TABLE Tarea ADD COLUMN organizadoPorId INT NULL;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE Tarea ADD COLUMN organizadoAt DATETIME(3) NULL;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE Tarea ADD COLUMN alcanceRecordatorio VARCHAR(191) NULL;`);
  } catch (e: any) {
    console.log("Nota: Algunas columnas ya podrían existir (" + e.message + ")");
  }

  console.log("2. Ejecutando scripts de transformación de datos...");
  
  // 1. clasificacion = 'POLITICA' → POLITICA
  await prisma.$executeRawUnsafe(`UPDATE Tarea SET tipo = 'POLITICA', estado = NULL WHERE clasificacion = 'POLITICA';`);
  
  // 2. formalizada = true, estado no es CERRADO/CANCELADO → TAREA con PENDIENTE
  await prisma.$executeRawUnsafe(`UPDATE Tarea SET tipo = 'TAREA', estado = 'PENDIENTE' WHERE formalizada = 1 AND estadoConceptual NOT IN ('DESCARTADO', 'CERRADO') AND clasificacion != 'POLITICA';`);
  
  // 3. formalizada = true, estadoConceptual = CERRADO → TAREA CERRADA
  await prisma.$executeRawUnsafe(`UPDATE Tarea SET tipo = 'TAREA', estado = 'CERRADA' WHERE formalizada = 1 AND estadoConceptual = 'CERRADO' AND clasificacion != 'POLITICA';`);
  
  // 4. requiereSeguimiento = true → RECORDATORIO
  await prisma.$executeRawUnsafe(`UPDATE Tarea SET tipo = 'RECORDATORIO', estado = NULL, alcanceRecordatorio = CASE WHEN (SELECT COUNT(*) FROM TareaAsignacion WHERE tareaId = Tarea.id) > 0 THEN 'PERSONAL' ELSE 'DEPARTAMENTO' END WHERE requiereSeguimiento = 1 AND tipo = 'SIN_ORGANIZAR';`);
  
  // 5. estadoConceptual = DESCARTADO → DESCARTADA
  await prisma.$executeRawUnsafe(`UPDATE Tarea SET tipo = 'DESCARTADA', estado = NULL WHERE estadoConceptual = 'DESCARTADO';`);
  
  // 6. Limpieza final: Asegurar que ninguna tarea tenga un estado inválido en el nuevo enum
  await prisma.$executeRawUnsafe(`UPDATE Tarea SET estado = NULL WHERE tipo != 'TAREA';`);
  await prisma.$executeRawUnsafe(`UPDATE Tarea SET estado = 'PENDIENTE' WHERE tipo = 'TAREA' AND estado NOT IN ('PENDIENTE', 'EN_REVISION', 'CERRADA', 'CANCELADA');`);
  
  // Fuerza absoluta para evitar truncation errors
  await prisma.$executeRawUnsafe(`UPDATE Tarea SET estado = NULL WHERE estado NOT IN ('PENDIENTE', 'EN_REVISION', 'CERRADA', 'CANCELADA');`);

  // Limpieza para Minuta (se eliminó EN_REVISION de EstadoMinuta)
  await prisma.$executeRawUnsafe(`UPDATE Minuta SET estado = 'ACTIVA' WHERE estado = 'EN_REVISION';`);

  // Limpieza para TipoNotificacion
  await prisma.$executeRawUnsafe(`UPDATE Notificacion SET tipo = 'ENTRADA_ORGANIZADA' WHERE tipo = 'ENTRADA_FORMALIZADA';`);
  await prisma.$executeRawUnsafe(`UPDATE Notificacion SET tipo = 'RECORDATORIO_ASIGNADO' WHERE tipo = 'SEGUIMIENTO_ASIGNADO';`);
  await prisma.$executeRawUnsafe(`UPDATE Notificacion SET tipo = 'VENCIMIENTO_PROXIMO' WHERE tipo = 'SEGUIMIENTO_PROXIMO';`);
  await prisma.$executeRawUnsafe(`UPDATE Notificacion SET tipo = 'NUEVAS_ENTRADAS' WHERE tipo = 'NUEVAS_TAREAS';`);

  console.log("Migración de datos completada exitosamente.");
}

main()
  .catch((e) => {
    console.error("Error fatal en migración:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
