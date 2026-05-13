import type { Request, Response } from "express";
import { Prisma, EstadoTarea } from "@prisma/client";

import { prisma } from "../../db";

import { registrarError } from "../../utils/logger";

import { buildTareasWhere } from "./helpers";

import { USUARIO_SELECT_BASICO } from "../shared-selects";

import type { ListTareasQuery } from "./zod";

export const listTareas = async (
  req: Request,
  res: Response
) => {
  try {
    const usuario = req.user!;

    const query =
      req.query as unknown as ListTareasQuery;

    const {
      page,
      limit,
      sort,
    } = query;

    const skip =
      (page - 1) * limit;

    // 1. Construir el filtro base que respeta TODO (incluyendo el estado seleccionado)
    const where =
      buildTareasWhere(query, usuario);

    // 2. Construir el filtro para el resumen (ignora el estado seleccionado para que los contadores no cambien)
    const whereParaResumen: Prisma.TareaWhereInput = { ...where };
    delete whereParaResumen.estadoOperativo;

    const orderBy =
      (sort ??
        [{ createdAt: "desc" }]) as Prisma.TareaOrderByWithRelationInput[];

    const [total, tareas, counts, totalAtrasadas, totalParaResumen] =
      await prisma.$transaction([
        // Total real filtrado (para paginación)
        prisma.tarea.count({
          where,
        }),

        // Lista de tareas
        prisma.tarea.findMany({
          where,

          skip,

          take: limit,

          orderBy,

          include: {
            imagenes: {
              orderBy: {
                orden: "asc",
              },
            },

            asignaciones: {
              include: {
                usuario: {
                  select: USUARIO_SELECT_BASICO,
                },
              },
            },

            minuta: {
              select: {
                id: true,
                titulo: true,
                estado: true,
                fecha: true,
              },
            },

            creadoPor: {
              select: USUARIO_SELECT_BASICO,
            },

            formalizadoPor: {
              select: {
                id: true,
                nombre: true,
              },
            },

            notas: {
              orderBy: {
                createdAt: "desc",
              },

              include: {
                creadoPor: {
                  select: {
                    id: true,
                    nombre: true,
                  },
                },
              },
            },
          },
        }),

        // Conteos por estado operativo (basado en whereParaResumen)
        prisma.tarea.groupBy({
          by: ["estadoOperativo"],
          where: {
            ...whereParaResumen,
            estadoOperativo: { not: null }
          },
          _count: {
            _all: true
          },
          orderBy: {
            estadoOperativo: 'asc'
          }
        }),

        // Total de atrasadas (basado en whereParaResumen o where? usualmente global)
        prisma.tarea.count({
          where: {
            ...whereParaResumen,
            fechaVencimiento: { lt: new Date() },
            estado: { notIn: [EstadoTarea.COMPLETADO, EstadoTarea.CERRADO] }
          }
        }),

        // Total "Real" para el primer botón del SummaryBar
        prisma.tarea.count({
          where: whereParaResumen
        })
      ]);

    // Mapear counts a objeto { PENDIENTE: 5, ... }
    const countsObj = counts.reduce((acc, curr: any) => {
      if (curr.estadoOperativo) {
        acc[curr.estadoOperativo] = curr._count?._all || 0;
      }
      return acc;
    }, {} as Record<string, number>);

    // Enriquecer tareas con isOverdue y responsables aplanados
    const now = new Date();
    const tareasConMeta = tareas.map((t: any) => ({
      ...t,
      isOverdue:
        t.fechaVencimiento &&
        new Date(t.fechaVencimiento) < now &&
        !['COMPLETADO', 'CERRADO'].includes(t.estado),
      responsables: t.asignaciones?.map((a: any) => ({
        id: a.usuario?.id,
        nombre: a.usuario?.nombre,
        imagen: a.usuario?.imagen,
        rol: a.usuario?.rol,
      })) ?? [],
    }));

    return res.json({
      status: "success",

      data: {
        total,

        totalFiltrado: totalParaResumen,

        page,

        limit,

        totalPages:
          Math.ceil(total / limit),

        counts: countsObj,

        totalAtrasadas,

        tareas: tareasConMeta,
      },
    });
  } catch (error) {
    await registrarError(
      "LISTAR_TAREAS",
      req.user?.id ?? null,
      error
    );

    return res.status(500).json({
      error:
        "Error al listar entradas organizacionales",
    });
  }
};