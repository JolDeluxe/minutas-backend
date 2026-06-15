// minutas-backend/src/modules/minutas_externas/03_get-by-id.ts
import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import { USUARIO_SELECT_BASICO } from "../shared-selects";
import type { MinutaExternaIdParams } from "./zod";

export const getMinutaExternaById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as unknown as MinutaExternaIdParams;

    const minuta = await prisma.minutaExterna.findUnique({
      where: { id },
      include: {
        creadoPor: { select: USUARIO_SELECT_BASICO },
        cerradoPor: { select: { id: true, nombre: true, username: true } },
        tareas: {
          where: {
            estado: { notIn: ["DESCARTADA", "CANCELADA"] },
          },
          orderBy: { createdAt: "asc" },
          include: {
            imagenes: { orderBy: { orden: "asc" } },
            notas: { orderBy: { createdAt: "desc" } },
            creadoPor: { select: USUARIO_SELECT_BASICO },
          },
        },
      },
    });

    if (!minuta) {
      return res.status(404).json({ error: "Minuta externa no encontrada" });
    }

    return res.json({ status: "success", data: minuta });
  } catch (error) {
    await registrarError("GET_MINUTA_EXTERNA_BY_ID", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al obtener minuta externa" });
  }
};
