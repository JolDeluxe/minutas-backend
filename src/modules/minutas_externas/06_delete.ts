// minutas-backend/src/modules/minutas_externas/06_delete.ts
import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarAccion, registrarError } from "../../utils/logger";
import type { MinutaExternaIdParams } from "./zod";

export const eliminarMinutaExterna = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { id } = req.params as unknown as MinutaExternaIdParams;

    const existing = await prisma.minutaExterna.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Minuta externa no encontrada" });
    }

    // Soft delete: cambiar estado a CANCELADA
    await prisma.minutaExterna.update({
      where: { id },
      data: { estado: "CANCELADA" },
    });

    await registrarAccion("CANCELAR_MINUTA_EXTERNA", usuarioId, `MinutaExterna #${id}`);

    return res.json({ status: "success", message: "Minuta externa cancelada" });
  } catch (error) {
    await registrarError("ELIMINAR_MINUTA_EXTERNA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al eliminar minuta externa" });
  }
};
