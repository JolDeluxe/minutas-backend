import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Area, EstadoTarea, Prisma } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import type { ListTareasQuery } from "./zod";

export const listarTareas = async (req: Request, res: Response) => {
  try {
    const { page, limit, estado, area, minutaId, isExternalArea, isComplete, q } =
      req.query as unknown as ListTareasQuery;
    const offset = (page - 1) * limit;

    const where: Prisma.TareaWhereInput = {};

    if (estado)                       where.estado         = estado as EstadoTarea;
    if (area)                         where.area           = area as Area;
    if (minutaId)                     where.minutaId       = minutaId;
    if (isExternalArea !== undefined) where.isExternalArea = isExternalArea;
    if (isComplete !== undefined)     where.isComplete     = isComplete;
    if (q)                            where.descripcion    = { contains: q };

    const [total, tareas] = await prisma.$transaction([
      prisma.tarea.count({ where }),
      prisma.tarea.findMany({
        where,
        take:    limit,
        skip:    offset,
        orderBy: { createdAt: "desc" },
        include: {
          imagenes: { orderBy: { orden: "asc" } },
          asignaciones: {
            include: {
              usuario: { select: { id: true, nombre: true, username: true, imagen: true } },
            },
          },
          creadoPor: { select: { id: true, nombre: true, username: true } },
        },
      }),
    ]);

    return res.json({
      status: "success",
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: tareas,
    });
  } catch (error) {
    await registrarError("LIST_TAREAS", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al listar tareas" });
  }
};