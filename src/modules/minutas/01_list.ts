import type { Request, Response } from "express";
import { prisma } from "../../db";
import { EstadoMinuta, Prisma } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import type { ListMinutasQuery } from "./zod";

export const listarMinutas = async (req: Request, res: Response) => {
  try {
    const { page, limit, estado, q } = req.query as unknown as ListMinutasQuery;
    const offset = (page - 1) * limit;

    const where: Prisma.MinutaWhereInput = {};
    if (estado) where.estado = estado as EstadoMinuta;
    if (q)      where.titulo = { contains: q };

    const [total, minutas] = await prisma.$transaction([
      prisma.minuta.count({ where }),
      prisma.minuta.findMany({
        where,
        take:     limit,
        skip:     offset,
        orderBy:  { fecha: "desc" },
        include: {
          // Se agrega area y linea para identificar el departamento del creador
          creadoPor: { select: { id: true, nombre: true, username: true, imagen: true, area: true, linea: true } },
          _count:    { select: { tareas: true } },
        },
      }),
    ]);

    return res.json({
      status: "success",
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: minutas,
    });
  } catch (error) {
    await registrarError("LIST_MINUTAS", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al listar minutas" });
  }
};