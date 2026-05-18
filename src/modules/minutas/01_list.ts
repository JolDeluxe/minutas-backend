import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Prisma, EstadoOperativo } from "@prisma/client";
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
          tareas: {
            select: {
              id: true,
              estado: true,
              estadoOperativo: true,
              fechaVencimiento: true,
              completadoAt: true,
            },
          },
        },
      }),
    ]);

    // Enriquecer cada minuta con resumen operativo para las cards ejecutivas
    const now = new Date();
    const minutasConResumen = minutas.map((m) => {
      const tareas = m.tareas || [];
      const totalEntradas = tareas.length;
      let completadas = 0;
      let enProgreso = 0;
      let pendientes = 0;
      let atrasadas = 0;
      let cerradas = 0;

      for (const t of tareas) {
        if (t.estado === "CERRADO") {
          cerradas++;
        } else if (t.estado === "COMPLETADO" || t.estadoOperativo === EstadoOperativo.COMPLETADO) {
          completadas++;
        } else if (t.estadoOperativo === EstadoOperativo.EN_PROGRESO) {
          enProgreso++;
          if (t.fechaVencimiento && new Date(t.fechaVencimiento) < now) {
            atrasadas++;
          }
        } else {
          pendientes++;
          if (t.fechaVencimiento && new Date(t.fechaVencimiento) < now) {
            atrasadas++;
          }
        }
      }

      // Remove raw tareas from response (only keep _count and resumen)
      const { tareas: _tareas, ...minutaSinTareas } = m;

      return {
        ...minutaSinTareas,
        resumenOperativo: {
          totalEntradas,
          completadas,
          enProgreso,
          pendientes,
          atrasadas,
          cerradas,
          porcentajeCompletado: totalEntradas > 0
            ? Math.round(((completadas + cerradas) / totalEntradas) * 100)
            : 0,
        },
      };
    });

    // ─── Navegación ejecutiva: Última junta y Anterior (GLOBAL, sin filtros) ───
    // El dueño necesita saber cuál es la junta más reciente y cuál la anterior
    // para poder decir "vamos a revisar la junta pasada".
    // Esto es INDEPENDIENTE de los filtros de la lista.
    const ultimasDosJuntas = await prisma.minuta.findMany({
      orderBy: { fecha: "desc" },
      take: 2,
      select: { id: true },
    });

    const ultimaJuntaId = ultimasDosJuntas[0]?.id ?? null;
    const juntaAnteriorId = ultimasDosJuntas[1]?.id ?? null;

    return res.json({
      status: "success",
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: minutasConResumen,
      navegacionEjecutiva: { ultimaJuntaId, juntaAnteriorId },
    });
  } catch (error) {
    await registrarError("LIST_MINUTAS", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al listar minutas" });
  }
};