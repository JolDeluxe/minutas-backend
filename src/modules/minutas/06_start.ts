import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarAccion, registrarError } from "../../utils/logger";
import type { MinutaIdParams } from "./zod";

export const iniciarMinuta = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { id } = req.params as unknown as MinutaIdParams;

    const minuta = await prisma.minuta.findUnique({
      where: { id },
      select: { id: true, estado: true, lineaDefault: true, titulo: true },
    });

    if (!minuta) {
      return res.status(404).json({ error: "Minuta no encontrada" });
    }

    if (minuta.estado !== "PROGRAMADA") {
      return res.status(400).json({ error: "Solo se pueden iniciar minutas PROGRAMADAS" });
    }

    // Find previous minuta
    const anterior = await prisma.minuta.findFirst({
      where: {
        lineaDefault: minuta.lineaDefault,
        estado: { in: ["CERRADA", "EN_REVISION"] }
      },
      orderBy: {
        fechaRealizada: "desc"
      }
    });

    const data: any = {
      estado: "ACTIVA",
      fechaRealizada: new Date(),
    };

    if (anterior) {
      data.minutaAnteriorId = anterior.id;
    }

    const updated = await prisma.minuta.update({
      where: { id },
      data,
    });

    await registrarAccion("INICIAR_MINUTA", usuarioId, `Minuta: "${minuta.titulo}"`);

    return res.status(200).json({ status: "success", data: updated });
  } catch (error) {
    await registrarError("INICIAR_MINUTA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al iniciar minuta" });
  }
};
