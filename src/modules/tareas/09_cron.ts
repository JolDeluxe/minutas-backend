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

    for (const tarea of tareasACerrar) {
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

      if (tarea.minutaId) {
        await evaluarEstadoMinuta(
          tarea.minutaId
        );
      }
    }

    console.log(
      `CRON finalizado. Cerradas: ${tareasACerrar.length}`
    );
  }
);