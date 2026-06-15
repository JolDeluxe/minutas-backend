// minutas-backend/src/modules/minutas_externas/04_update.ts
import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarAccion, registrarError } from "../../utils/logger";
import { USUARIO_SELECT_BASICO } from "../shared-selects";
import type { MinutaExternaIdParams, UpdateMinutaExternaInput } from "./zod";

export const updateMinutaExterna = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { id } = req.params as unknown as MinutaExternaIdParams;
    const { tema, area, departamento, objetivo, integrantes, asistentes, resumenTemas, resumenAcuerdos, resumenProximosPasos, fechaProgramada } = req.body;

    const existing = await prisma.minutaExterna.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Minuta externa no encontrada" });
    }

    const updated = await prisma.minutaExterna.update({
      where: { id },
      data: {
        ...(tema !== undefined && { tema }),
        ...(area !== undefined && { area }),
        ...(departamento !== undefined && { departamento }),
        ...(objetivo !== undefined && { objetivo }),
        ...(integrantes !== undefined && { integrantes }),
        ...(asistentes !== undefined && { asistentes }),
        ...(resumenTemas !== undefined && { resumenTemas }),
        ...(resumenAcuerdos !== undefined && { resumenAcuerdos }),
        ...(resumenProximosPasos !== undefined && { resumenProximosPasos }),
        ...(fechaProgramada !== undefined && { fechaProgramada: fechaProgramada ? new Date(fechaProgramada) : null }),
      },
      include: {
        creadoPor: { select: USUARIO_SELECT_BASICO },
        _count: { select: { tareas: true } },
      },
    });

    await registrarAccion("ACTUALIZAR_MINUTA_EXTERNA", usuarioId, `MinutaExterna #${id}`);

    return res.json({ status: "success", data: updated });
  } catch (error) {
    await registrarError("UPDATE_MINUTA_EXTERNA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al actualizar minuta externa" });
  }
};
