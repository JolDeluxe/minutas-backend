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

    const formattedSort = (sort || []).map((item: any) => {
      const newItem: any = {};
      for (const [key, value] of Object.entries(item)) {
        if (key === "fecha") {
          newItem.fechaProgramada = value;
        } else {
          newItem[key] = value;
        }
      }
      return newItem;
    });

    const [total, minutas] = await prisma.$transaction([
      prisma.minuta.count({ where }),
      prisma.minuta.findMany({
        where,
        take:    limit,
        skip:    offset,
        orderBy: formattedSort as Prisma.MinutaOrderByWithRelationInput[],
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

    // ─── Navegación ejecutiva: Última junta y Anterior (GLOBAL, sin filtros) ───
    const ultimasDosJuntas = await prisma.minuta.findMany({
      where: { estado: { in: ["ACTIVA", "EN_REVISION", "CERRADA"] } },
      orderBy: { fechaRealizada: "desc" },
      take: 2,
      select: { id: true },
    });

    const ultimaJuntaId = ultimasDosJuntas[0]?.id ?? null;
    const juntaAnteriorId = ultimasDosJuntas[1]?.id ?? null;

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
        isJuntaActual: m.id === ultimaJuntaId,
        isJuntaAnterior: m.id === juntaAnteriorId,
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