import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import type { MinutaIdParams } from "./zod";

/**
 * GET /api/minutas/:id/compare
 * Compara la minuta actual con la inmediatamente anterior (por fecha, misma línea).
 * Retorna cuántas entradas se completaron desde la anterior, cuántas siguen pendientes,
 * cuántas son nuevas y cuántas están atrasadas.
 */
export const compararConAnterior = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as unknown as MinutaIdParams;

    // Obtener la minuta actual
    const minutaActual = await prisma.minuta.findUnique({
      where: { id },
      select: { id: true, titulo: true, fecha: true, lineaDefault: true },
    });

    if (!minutaActual) {
      return res.status(404).json({ error: "Minuta no encontrada" });
    }

    // Buscar la minuta inmediatamente anterior (misma línea, fecha anterior)
    const minutaAnterior = await prisma.minuta.findFirst({
      where: {
        id: { not: id },
        lineaDefault: minutaActual.lineaDefault,
        fecha: { lt: minutaActual.fecha },
      },
      orderBy: { fecha: "desc" },
      select: { id: true, titulo: true, fecha: true },
    });

    if (!minutaAnterior) {
      return res.json({
        status: "success",
        data: {
          minutaAnterior: null,
          comparacion: null,
          mensaje: "No existe una minuta anterior para comparar.",
        },
      });
    }

    const now = new Date();

    // Entradas de la minuta anterior y su estado ACTUAL
    const entradasAnterior = await prisma.tarea.findMany({
      where: { minutaId: minutaAnterior.id },
      select: {
        id: true,
        estado: true,
        estadoOperativo: true,
        fechaVencimiento: true,
        completadoAt: true,
      },
    });

    // Entradas de la minuta actual
    const entradasActual = await prisma.tarea.findMany({
      where: { minutaId: id },
      select: {
        id: true,
        estado: true,
        estadoOperativo: true,
        fechaVencimiento: true,
      },
    });

    // Calcular comparación
    let completadasDesdeAnterior = 0;
    let sigueEnProgreso = 0;
    let siguePendiente = 0;
    let atrasadasAnterior = 0;

    for (const t of entradasAnterior) {
      if (t.estado === "COMPLETADO" || t.estado === "CERRADO") {
        completadasDesdeAnterior++;
      } else if (t.estadoOperativo === "EN_PROGRESO") {
        sigueEnProgreso++;
        if (t.fechaVencimiento && new Date(t.fechaVencimiento) < now) {
          atrasadasAnterior++;
        }
      } else {
        siguePendiente++;
        if (t.fechaVencimiento && new Date(t.fechaVencimiento) < now) {
          atrasadasAnterior++;
        }
      }
    }

    const nuevasEnEstaMinuta = entradasActual.length;

    let atrasadasActual = 0;
    for (const t of entradasActual) {
      if (
        t.fechaVencimiento &&
        new Date(t.fechaVencimiento) < now &&
        t.estado !== "COMPLETADO" &&
        t.estado !== "CERRADO"
      ) {
        atrasadasActual++;
      }
    }

    return res.json({
      status: "success",
      data: {
        minutaAnterior: {
          id: minutaAnterior.id,
          titulo: minutaAnterior.titulo,
          fecha: minutaAnterior.fecha,
        },
        comparacion: {
          totalAnterior: entradasAnterior.length,
          completadasDesdeAnterior,
          sigueEnProgreso,
          siguePendiente,
          atrasadasAnterior,
          nuevasEnEstaMinuta,
          atrasadasActual,
        },
      },
    });
  } catch (error) {
    await registrarError("COMPARE_MINUTAS", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al comparar minutas" });
  }
};
