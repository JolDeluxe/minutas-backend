import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import { obtenerResumenMinuta } from "./helpers";
import type { MinutaIdParams } from "./zod";

export const getMinutaById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as unknown as MinutaIdParams;

    const minuta = await prisma.minuta.findUnique({
      where: { id },
      include: {
        creadoPor: { select: { id: true, nombre: true, username: true, imagen: true } },
        tareas: {
          orderBy: { createdAt: "asc" },
          include: {
            imagenes: { orderBy: { orden: "asc" } },
            asignaciones: {
              include: {
                usuario: { select: { id: true, nombre: true, username: true, imagen: true } },
              },
            },
            creadoPor: { select: { id: true, nombre: true, username: true } },
          },
        },
      },
    });

    if (!minuta) {
      return res.status(404).json({ error: "Minuta no encontrada" });
    }

    const resumen = await obtenerResumenMinuta(id);

    return res.json({ status: "success", data: { ...minuta, resumen } });
  } catch (error) {
    await registrarError("GET_MINUTA_BY_ID", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al obtener minuta" });
  }
};