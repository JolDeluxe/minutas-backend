import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import type { TareaIdParams } from "./zod";

export const getTareaById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as unknown as TareaIdParams;

    const tarea = await prisma.tarea.findUnique({
      where: { id },
      include: {
        imagenes:     { orderBy: { orden: "asc" } },
        asignaciones: {
          include: {
            usuario: { select: { id: true, nombre: true, username: true, imagen: true } },
          },
        },
        creadoPor: { select: { id: true, nombre: true, username: true, imagen: true } },
        minuta:    { select: { id: true, titulo: true, estado: true } },
        historial: {
          orderBy: { createdAt: "desc" },
          take:    20,
          include: {
            usuario: { select: { id: true, nombre: true, username: true } },
          },
        },
      },
    });

    if (!tarea) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    return res.json({ status: "success", data: tarea });
  } catch (error) {
    await registrarError("GET_TAREA_BY_ID", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al obtener tarea" });
  }
};