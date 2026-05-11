import type { Request, Response } from "express";
import { prisma } from "../../db";
import { EstadoMinuta, EstadoTarea } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import type { MinutaIdParams } from "./zod";

export const cerrarMinuta = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { id } = req.params as unknown as MinutaIdParams;

    const minuta = await prisma.minuta.findUnique({
      where: { id },
    });

    if (!minuta) {
      return res.status(404).json({ error: "Minuta no encontrada" });
    }

    if (minuta.estado === EstadoMinuta.CERRADA) {
      return res.status(400).json({ error: "La minuta ya se encuentra cerrada" });
    }

    const minutaActualizada = await prisma.minuta.update({
      where: { id },
      data: {
        estado: EstadoMinuta.CERRADA,
        cerradoPorId: usuarioId,
        cerradoAt: new Date(),
      },
    });

    // Advertencia informativa sobre entradas pendientes
    const entradasPendientes = await prisma.tarea.count({
      where: {
        minutaId: id,
        estado: { notIn: [EstadoTarea.CERRADO, EstadoTarea.COMPLETADO] },
      },
    });

    await registrarAccion("CERRAR_MINUTA", usuarioId, `Minuta ID: ${id}`);

    return res.json({
      status: "success",
      data: minutaActualizada,
      message: "Minuta cerrada correctamente",
      advertencia: entradasPendientes > 0
        ? `Existen ${entradasPendientes} entradas organizacionales sin cerrar/completar`
        : undefined,
    });
  } catch (error) {
    await registrarError("CERRAR_MINUTA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al cerrar la minuta" });
  }
};