import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Prisma } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import { buildTareasWhere } from "./helpers";
import type { ListTareasQuery } from "./zod";

export const listTareas = async (req: Request, res: Response) => {
  try {
    const usuario = req.user!;
    const query   = req.query as unknown as ListTareasQuery;
    const { page, limit, sort } = query;
    const skip    = (page - 1) * limit;

    const where = buildTareasWhere(query, usuario);

    const [total, tareas] = await prisma.$transaction([
      prisma.tarea.count({ where }),
      prisma.tarea.findMany({
        where,
        skip,
        take:    limit,
        orderBy: sort as Prisma.TareaOrderByWithRelationInput[],
        include: {
          imagenes:     { orderBy: { orden: "asc" } },
          asignaciones: {
            include: {
              usuario: { select: { id: true, nombre: true, imagen: true } },
            },
          },
          minuta:    { select: { id: true, titulo: true, estado: true } },
          creadoPor: { select: { id: true, nombre: true } },
          notas:     true,
        },
      }),
    ]);

    return res.json({
      status: "success",
      data: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        tareas,
      },
    });
  } catch (error) {
    await registrarError("LISTAR_TAREAS", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al listar las tareas" });
  }
};