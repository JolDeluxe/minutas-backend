import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import type { MinutaIdParams } from "./zod";

export const compararConAnterior = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as unknown as MinutaIdParams;

    const minutaActual = await prisma.minuta.findUnique({
      where: { id },
      select: { id: true, titulo: true, fechaProgramada: true, lineaDefault: true },
    });

    if (!minutaActual) {
      return res.status(404).json({ error: "Minuta no encontrada" });
    }

    const minutaAnterior = await prisma.minuta.findFirst({
      where: {
        id: { not: id },
        lineaDefault: minutaActual.lineaDefault,
        fechaProgramada: { lt: minutaActual.fechaProgramada },
      },
      orderBy: { fechaProgramada: "desc" },
      select: { id: true, titulo: true, fechaProgramada: true, fechaRealizada: true },
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

    const entradasAnterior = await prisma.tarea.findMany({
      where: { minutaId: minutaAnterior.id },
      select: {
        id: true,
        estado: true,
        tipo: true,
        fechaVencimiento: true,
        completadoAt: true,
      },
    });

    const entradasActual = await prisma.tarea.findMany({
      where: { minutaId: id },
      select: {
        id: true,
        estado: true,
        tipo: true,
        fechaVencimiento: true,
      },
    });

    let completadasDesdeAnterior = 0;
    let sigueEnProgreso = 0;
    let siguePendiente = 0;
    let atrasadasAnterior = 0;

    for (const t of entradasAnterior) {
      if (t.estado === "CERRADA" || t.estado === "CANCELADA") {
        completadasDesdeAnterior++;
      } else if (t.estado === "EN_REVISION") {
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
        t.estado !== "CERRADA" &&
        t.estado !== "CANCELADA"
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
          fecha: minutaAnterior.fechaRealizada || minutaAnterior.fechaProgramada,
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
