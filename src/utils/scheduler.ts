import cron from "node-cron";
import { prisma } from "../db";
import { EstadoTarea } from "@prisma/client";
import { evaluarEstadoMinuta } from "../modules/tareas/helpers";
import { cleanupOldTaskImages } from "./task-image-cleanup";

export const iniciarTareasProgramadas = () => {
  console.log("⏳ Tareas programadas (CRON) inicializadas.");

  // Se ejecuta todos los días a las 2:00 AM ("0 2 * * *")
  cron.schedule("0 2 * * *", async () => {
    console.log("Iniciando revisión diaria de tareas (CRON)...");
    
    try {
      const ahora = new Date();
      
      // 1. Cerrar Tareas de Diseño Completadas que nadie revisó (Regla de 10 días)
      const hace10Dias = new Date();
      hace10Dias.setDate(hace10Dias.getDate() - 10);

      const tareasOlidadas = await prisma.tarea.findMany({
        where: {
          estado: EstadoTarea.EN_REVISION,
          completadoAt: { lte: hace10Dias }
        }
      });

      const tareasACerrar = [...tareasOlidadas];

      if (tareasACerrar.length > 0) {
        for (const tarea of tareasACerrar) {
          await prisma.tarea.update({
            where: { id: tarea.id },
            data: { estado: EstadoTarea.CERRADA, cerradoAt: ahora }
          });

          // Revisar si esto provoca que su minuta se cierre automáticamente
          if (tarea.minutaId) {
            await evaluarEstadoMinuta(tarea.minutaId);
          }
        }
        console.log(`✅ CRON: Se cerraron automáticamente ${tareasACerrar.length} tareas.`);
      } else {
        console.log("✅ CRON: Revisión completada. Sin tareas para cerrar hoy.");
      }
    } catch (error) {
      console.error("❌ Error ejecutando el CRON de tareas:", error);
    }

    try {
      const result = await cleanupOldTaskImages(3);

      if (result.processed > 0 || result.errors > 0) {
        await prisma.bitacora.create({
          data: {
            accion: "CRON_LIMPIEZA_IMAGENES_TAREA",
            detalles: `Procesadas: ${result.processed}, Sustituidas: ${result.replaced}, Errores: ${result.errors}`,
            usuarioId: null,
          },
        });
      }

      console.log(
        `✅ CRON imágenes: procesadas=${result.processed}, sustituidas=${result.replaced}, errores=${result.errors}`
      );
    } catch (error) {
      console.error("❌ Error ejecutando limpieza de imágenes de tareas:", error);
    }
  });
};
