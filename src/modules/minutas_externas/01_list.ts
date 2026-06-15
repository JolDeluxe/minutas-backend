// minutas-backend/src/modules/minutas_externas/01_list.ts
import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Prisma, Area } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import { USUARIO_SELECT_BASICO } from "../shared-selects";
import type { ListMinutasExternasQuery } from "./zod";

export const listarMinutasExternas = async (req: Request, res: Response) => {
  try {
    const query = req.query as unknown as ListMinutasExternasQuery;
    const { page = 1, limit = 20 } = query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: Prisma.MinutaExternaWhereInput = {};

    if (query.q) {
      where.OR = [
        { tema: { contains: query.q } },
        { objetivo: { contains: query.q } },
      ];
    }

    if (query.area?.length) {
      where.area = { in: query.area as Area[] };
    }

    if (query.estado?.length) {
      where.estado = { in: query.estado as any[] };
    } else {
      where.estado = { not: "CANCELADA" };
    }
    
    console.log("LIST MINUTAS EXTERNAS WHERE:", JSON.stringify(where, null, 2));

    const [total, minutas] = await prisma.$transaction([
      prisma.minutaExterna.count({ where }),
      prisma.minutaExterna.findMany({
        where,
        take: Number(limit),
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          creadoPor: { select: USUARIO_SELECT_BASICO },
          tareas: {
            where: {
              estado: { not: "CANCELADA" }
            },
            select: {
              id: true,
              estado: true,
              notificadoAt: true,
            }
          }
        },
      }),
    ]);

    const minutasConResumen = minutas.map((m) => {
      const tareas = m.tareas || [];
      const totalTareas = tareas.length;
      let completadas = 0;
      let pendientes = 0;

      for (const t of tareas) {
        if (t.notificadoAt || t.estado === "CERRADA") {
          completadas++;
        } else {
          pendientes++;
        }
      }

      const { tareas: _tareas, ...minutaSinTareas } = m;

      return {
        ...minutaSinTareas,
        resumenOperativo: {
          totalEntradas: totalTareas,
          completadas: 0,
          cerradas: completadas,
          pendientes: pendientes,
          atrasadas: 0,
          enProgreso: 0,
          porcentajeCompletado: totalTareas > 0 ? Math.round((completadas / totalTareas) * 100) : 0,
          hasActiveTasks: pendientes > 0,
        }
      };
    });

    return res.json({
      status: "success",
      pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
      data: minutasConResumen,
    });
  } catch (error) {
    await registrarError("LIST_MINUTAS_EXTERNAS", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al listar minutas externas" });
  }
};
