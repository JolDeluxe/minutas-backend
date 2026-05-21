import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Prisma, EstadoTarea, TipoEntrada } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import { buildMinutasWhere } from "./helpers";
import { USUARIO_SELECT_BASICO } from "../shared-selects";
import type { ListMinutasQuery } from "./zod";

export const listarMinutas = async (req: Request, res: Response) => {
  try {
    const query              = req.query as unknown as ListMinutasQuery;
    const { page, limit, sort } = query;
    const offset             = (page - 1) * limit;

    const where = buildMinutasWhere(query, req.user);

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
              tipo: true,
              estado: true,
              fechaVencimiento: true,
              completadoAt: true,
            },
          },
        },
      }),
    ]);

    // ─── Navegación ejecutiva: Última junta y Anterior (POR DEPARTAMENTO) ───
    const ultimasDiseno = await prisma.minuta.findMany({
      where: { estado: { in: ["ACTIVA", "CERRADA"] }, departamento: "DISENO" },
      orderBy: { fechaRealizada: "desc" },
      take: 2,
      select: { id: true },
    });

    const ultimasMarketing = await prisma.minuta.findMany({
      where: { estado: { in: ["ACTIVA", "CERRADA"] }, departamento: "MARKETING" },
      orderBy: { fechaRealizada: "desc" },
      take: 2,
      select: { id: true },
    });

    const ultimaJuntaId = {
      DISENO: ultimasDiseno[0]?.id ?? null,
      MARKETING: ultimasMarketing[0]?.id ?? null,
    };
    
    const juntaAnteriorId = {
      DISENO: ultimasDiseno[1]?.id ?? null,
      MARKETING: ultimasMarketing[1]?.id ?? null,
    };

    // Enriquecer cada minuta con resumen operativo para las cards ejecutivas
    const now = new Date();
    const minutasConResumen = minutas.map((m) => {
      const tareas = m.tareas || [];
      const totalEntradas = tareas.length;
      let completadas = 0; // Se mapea EN_REVISION a "completadas" visualmente para UI
      let pendientes = 0;
      let atrasadas = 0;
      let cerradas = 0;

      for (const t of tareas) {
        if (t.tipo !== TipoEntrada.TAREA) continue;

        if (t.estado === EstadoTarea.CERRADA) {
          cerradas++;
        } else if (t.estado === EstadoTarea.EN_REVISION) {
          completadas++; // Esperando revisión pero completada por el ejecutor
        } else if (t.estado === EstadoTarea.PENDIENTE) {
          pendientes++;
          if (t.fechaVencimiento && new Date(t.fechaVencimiento) < now) {
            atrasadas++;
          }
        }
      }

      // Remove raw tareas from response (only keep _count and resumen)
      const { tareas: _tareas, ...minutaSinTareas } = m;

      // Solo consideramos TAREAS (que tienen estado) para el porcentaje
      const totalTareasOperativas = cerradas + completadas + pendientes;

      return {
        ...minutaSinTareas,
        departamento: m.departamento, // include for frontend logic
        isJuntaActual: m.departamento === 'DISENO' ? m.id === ultimaJuntaId.DISENO : m.id === ultimaJuntaId.MARKETING,
        isJuntaAnterior: m.departamento === 'DISENO' ? m.id === juntaAnteriorId.DISENO : m.id === juntaAnteriorId.MARKETING,
        resumenOperativo: {
          totalEntradas, // Count of all entries (including reminders, unorganized, etc)
          completadas,
          enProgreso: 0, // Legacy support
          pendientes,
          atrasadas,
          cerradas,
          porcentajeCompletado: totalTareasOperativas > 0
            ? Math.round(((completadas + cerradas) / totalTareasOperativas) * 100)
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