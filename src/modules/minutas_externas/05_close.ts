// minutas-backend/src/modules/minutas_externas/05_close.ts
import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarAccion, registrarError } from "../../utils/logger";
import type { MinutaExternaIdParams } from "./zod";

export const cerrarMinutaExterna = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { id } = req.params as unknown as MinutaExternaIdParams;

    const existing = await prisma.minutaExterna.findUnique({ 
      where: { id },
      include: { tareas: true }
    });
    if (!existing) {
      return res.status(404).json({ error: "Minuta externa no encontrada" });
    }

    const hasPendingTasks = existing.tareas.some(t => t.notificadoAt === null);
    if (hasPendingTasks) {
      return res.status(400).json({ error: "No se puede cerrar la minuta. Todas las tareas deben estar marcadas como completadas." });
    }

    if (existing.estado !== "ACTIVA") {
      return res.status(400).json({ error: "Solo se pueden cerrar minutas externas activas" });
    }

    const updated = await prisma.minutaExterna.update({
      where: { id },
      data: {
        estado: "CERRADA",
        cerradoPorId: usuarioId,
        cerradoAt: new Date(),
      },
    });

    await registrarAccion("CERRAR_MINUTA_EXTERNA", usuarioId, `MinutaExterna #${id}`);

    return res.json({ status: "success", data: updated });
  } catch (error) {
    await registrarError("CERRAR_MINUTA_EXTERNA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al cerrar minuta externa" });
  }
};
