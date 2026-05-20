import type { Request, Response } from "express";
import { Prisma, EstadoTarea, EstadoOperativo } from "@prisma/client";

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

    // 1. Construir el filtro base para la lista principal
    const where = buildTareasWhere(query, usuario);

    // 2. Construir el filtro para el resumen
    // Quitamos los filtros de estado para que los contadores no se auto-filtren,
    // pero mantenemos todo el resto del contexto (búsqueda, área, formalizada, etc.)
    const queryParaResumen = { ...query, todo: true };
    delete (queryParaResumen as any).estadoOperativo;
    delete (queryParaResumen as any).estado;
    delete (queryParaResumen as any).estadoConceptual;
    delete (queryParaResumen as any).atrasadas;

    const whereParaResumen = buildTareasWhere(queryParaResumen, usuario);

    const orderBy =
      (sort ??
        [{ createdAt: "desc" }]) as Prisma.TareaOrderByWithRelationInput[];

    const [total, tareas, counts, totalAtrasadas, totalActivas, totalCerradas] =
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
                fechaProgramada: true,
                fechaRealizada: true,
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
        // EXCLUIMOS físicamente las CERRADAS para que no ensucien los conteos operativos
        prisma.tarea.groupBy({
          by: ["estadoOperativo"],
          where: {
            ...whereParaResumen,
            estadoOperativo: { not: null },
            estado: { not: EstadoTarea.CERRADO } 
          },
          _count: {
            _all: true
          },
          orderBy: {
            estadoOperativo: 'asc'
          }
        }),

        // Total de atrasadas (basado en whereParaResumen)
        prisma.tarea.count({
          where: {
            ...whereParaResumen,
            fechaVencimiento: { lt: new Date() },
            estado: { notIn: [EstadoTarea.COMPLETADO, EstadoTarea.CERRADO] }
          }
        }),

        // Total "Real" para el primer botón del SummaryBar (Solo Activas: Pendiente + Proceso)
        // También excluimos CERRADAS por seguridad
        prisma.tarea.count({
          where: {
            ...whereParaResumen,
            estado: { not: EstadoTarea.CERRADO },
            estadoOperativo: { in: [EstadoOperativo.PENDIENTE, EstadoOperativo.EN_PROGRESO] }
          }
        }),

        // Conteo específico de Cerradas (estado físico CERRADO)
        prisma.tarea.count({
          where: {
            ...whereParaResumen,
            estado: EstadoTarea.CERRADO
          }
        })
      ]);

    // Mapear counts a objeto { PENDIENTE: 5, ... }
    const countsObj = counts.reduce((acc, curr: any) => {
      if (curr.estadoOperativo) {
        acc[curr.estadoOperativo] = curr._count?._all || 0;
      }
      return acc;
    }, {} as Record<string, number>);

    // Añadir el conteo de cerradas al objeto de counts
    countsObj['CERRADO'] = totalCerradas;

    // Consultar últimas dos juntas para enriquecer la relación de minuta
    const ultimasDosJuntas = await prisma.minuta.findMany({
      where: { estado: { in: ["ACTIVA", "CERRADA"] } },
      orderBy: { fechaRealizada: "desc" },
      take: 2,
      select: { id: true },
    });
    const ultimaJuntaId = ultimasDosJuntas[0]?.id ?? null;
    const juntaAnteriorId = ultimasDosJuntas[1]?.id ?? null;

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
      minuta: t.minuta
        ? {
            ...t.minuta,
            isJuntaActual: t.minuta.id === ultimaJuntaId,
            isJuntaAnterior: t.minuta.id === juntaAnteriorId,
          }
        : null,
    }));

    return res.json({
      status: "success",

      data: {
        total,

        totalFiltrado: totalActivas,

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