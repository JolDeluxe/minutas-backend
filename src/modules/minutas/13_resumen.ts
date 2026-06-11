// minutas-backend/src/modules/minutas/13_resumen.ts
/**
 * Módulo de Resumen de Minuta (Edición Manual).
 *
 * Expone un único handler:
 *  - guardarResumen    → PUT /:id/resumen
 *    Actualiza manualmente las secciones del resumen. Restringido solo al Administrador.
 */

import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";

export const guardarResumen = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const minutaId = Number(id);

    if (!minutaId || isNaN(minutaId)) {
      return res.status(400).json({ error: "ID de minuta inválido" });
    }

    const { resumenTemas, resumenAcuerdos, resumenProximosPasos } = req.body as {
      resumenTemas?: string;
      resumenAcuerdos?: string;
      resumenProximosPasos?: string;
    };

    // Verificar que la minuta existe
    const minuta = await prisma.minuta.findUnique({
      where: { id: minutaId },
      select: { id: true },
    });

    if (!minuta) {
      return res.status(404).json({ error: "Minuta no encontrada" });
    }

    // Restricción estricta: Solo el Administrador puede editar el resumen
    const usuario = req.user!;
    if (usuario.rol !== "ADMIN") {
      return res.status(403).json({ error: "Solo el Administrador puede editar el resumen de la minuta" });
    }

    const data: Record<string, string | null> = {};
    if (resumenTemas !== undefined) data.resumenTemas = resumenTemas;
    if (resumenAcuerdos !== undefined) data.resumenAcuerdos = resumenAcuerdos;
    if (resumenProximosPasos !== undefined) data.resumenProximosPasos = resumenProximosPasos;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No se enviaron campos a actualizar" });
    }

    const minutaActualizada = await prisma.minuta.update({
      where: { id: minutaId },
      data,
    });

    return res.json({
      status: "success",
      data: {
        resumenTemas: minutaActualizada.resumenTemas,
        resumenAcuerdos: minutaActualizada.resumenAcuerdos,
        resumenProximosPasos: minutaActualizada.resumenProximosPasos,
      },
    });
  } catch (error) {
    await registrarError("GUARDAR_RESUMEN", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al guardar el resumen" });
  }
};
