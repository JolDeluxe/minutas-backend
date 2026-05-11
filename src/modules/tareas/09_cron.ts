import cron from "node-cron";

import { prisma } from "../../db";

import {
  EstadoConceptual,
  EstadoOperativo,
  EstadoTarea,
} from "@prisma/client";

import {
  evaluarEstadoMinuta,
} from "./helpers";

cron.schedule(
  "0 2 * * *",
  async () => {
    try {
      console.log(
        "CRON tareas iniciado..."
      );

      const ahora = new Date();

      const hace10Dias =
        new Date();

      hace10Dias.setDate(
        hace10Dias.getDate() - 10
      );

      const tareasOlvidadas =
        await prisma.tarea.findMany({
          where: {
            estado: EstadoTarea.COMPLETADO,

            estadoConceptual: {
              not:
                EstadoConceptual.CERRADO,
            },

            estadoOperativo:
              EstadoOperativo.COMPLETADO,

            completadoAt: {
              lte: hace10Dias,
            },

            isExternalArea: false,
          },
        });

      const tareasExternas =
        await prisma.tarea.findMany({
          where: {
            isExternalArea: true,

            estado: {
              not:
                EstadoTarea.CERRADO,
            },

            fechaVencimiento: {
              lte: ahora,
            },
          },
        });

      const tareasACerrar = [
        ...tareasOlvidadas,
        ...tareasExternas,
      ];

      let cerradas = 0;
      let errores = 0;

      for (const tarea of tareasACerrar) {
        try {
          await prisma.tarea.update({
            where: {
              id: tarea.id,
            },

            data: {
              estado:
                EstadoTarea.CERRADO,

              estadoConceptual:
                EstadoConceptual.CERRADO,

              cerradoAt: ahora,
            },
          });

          cerradas++;

          if (tarea.minutaId) {
            await evaluarEstadoMinuta(
              tarea.minutaId
            );
          }
        } catch (err) {
          errores++;
          console.error(
            `CRON: Error cerrando tarea ${tarea.id}:`,
            err
          );
        }
      }

      // Registrar resultado en bitácora del sistema
      if (tareasACerrar.length > 0) {
        await prisma.bitacora.create({
          data: {
            accion: "CRON_CIERRE_AUTOMATICO",
            detalles: `Cerradas: ${cerradas}, Errores: ${errores}`,
            usuarioId: null,
          },
        });
      }

      console.log(
        `CRON finalizado. Cerradas: ${cerradas}, Errores: ${errores}`
      );
    } catch (error) {
      console.error(
        "CRON: Error crítico en cierre automático:",
        error
      );

      // Intentar registrar el error crítico en bitácora
      try {
        await prisma.bitacora.create({
          data: {
            accion: "CRON_ERROR_CRITICO",
            detalles: String(error),
            usuarioId: null,
          },
        });
      } catch (_) {}
    }
  }
);