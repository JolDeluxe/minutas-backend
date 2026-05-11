import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Prisma } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import { buildMinutasWhere } from "./helpers";
import { USUARIO_SELECT_BASICO } from "../shared-selects";
import type { ListMinutasQuery } from "./zod";

export const listarMinutas = async (req: Request, res: Response) => {
  try {
    const query              = req.query as unknown as ListMinutasQuery;
    const { page, limit, sort } = query;
    const offset             = (page - 1) * limit;

    const where = buildMinutasWhere(query);

    const [total, minutas] = await prisma.$transaction([
      prisma.minuta.count({ where }),
      prisma.minuta.findMany({
        where,
        take:    limit,
        skip:    offset,
        orderBy: sort as Prisma.MinutaOrderByWithRelationInput[],
        include: {
          creadoPor: {
            select: USUARIO_SELECT_BASICO,
          },
          _count: { select: { tareas: true, notasGenerales: true } },
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