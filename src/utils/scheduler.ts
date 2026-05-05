import cron from "node-cron";
import { prisma } from "../db";
import { EstadoTarea } from "@prisma/client";

export const iniciarTareasProgramadas = () => {

  // CRON 1: Auto-cierre de tareas vencidas
  // Todos los días a la 01:00 AM
  cron.schedule("0 1 * * *", async () => {
    console.log("[CRON] Evaluando tareas vencidas para auto-cierre...");
    try {
      const hoy = new Date();

      const tareasCandidatas = await prisma.tarea.findMany({
        where: {
          estado: { notIn: [EstadoTarea.CERRADO] },
          fechaVencimiento: { lte: hoy },
        },
        select: { id: true, estado: true, completadoAt: true },
      });

      let cerradas = 0;

      for (const tarea of tareasCandidatas) {
        await prisma.tarea.update({
          where: { id: tarea.id },
          data: {
            estado: EstadoTarea.CERRADO,
            cerradoAt: hoy,
          },
        });
        cerradas++;
      }

      console.log(`[CRON] Auto-cierre completado: ${cerradas} tareas cerradas.`);
    } catch (error) {
      console.error("[CRON ERROR] Falló el auto-cierre de tareas:", error);
    }
  });

  // CRON 2: Limpieza de bitácora antigua (6 meses)
  cron.schedule("0 3 * * *", async () => {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - 180);

    try {
      const borrados = await prisma.bitacora.deleteMany({
        where: { createdAt: { lt: fechaLimite } },
      });

      if (borrados.count > 0) {
        console.log(`[CRON] Bitácora limpiada: ${borrados.count} registros eliminados.`);
      }
    } catch (error) {
      console.error("[CRON ERROR] Falló la limpieza de bitácora:", error);
    }
  });

  console.log("[SYSTEM] CRON inicializados: Auto-cierre tareas (01:00 AM) | Limpieza bitácora (03:00 AM)");
};