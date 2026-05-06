import cron from "node-cron";
import { prisma } from "../db";
import { EstadoTarea } from "@prisma/client";
import { evaluarEstadoMinuta } from "../modules/tareas/helpers";

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
          estado: EstadoTarea.COMPLETADO,
          isExternalArea: false,
          completadoAt: { lte: hace10Dias },
          fechaVencimiento: { lte: ahora } // Ya pasó la fecha límite
        }
      });

      // 2. Cerrar Tareas Externas por fecha de vencimiento
      const tareasExternasVencidas = await prisma.tarea.findMany({
        where: {
          isExternalArea: true,
          estado: { not: EstadoTarea.CERRADO },
          fechaVencimiento: { lte: ahora }
        }
      });

      const tareasACerrar = [...tareasOlidadas, ...tareasExternasVencidas];

      if (tareasACerrar.length > 0) {
        for (const tarea of tareasACerrar) {
          await prisma.tarea.update({
            where: { id: tarea.id },
            data: { estado: EstadoTarea.CERRADO, cerradoAt: ahora }
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
  });
};