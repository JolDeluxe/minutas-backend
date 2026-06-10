import type { Request, Response } from "express";
import { Prisma, EstadoTarea, TipoEntrada } from "@prisma/client";
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
    const query = req.query as unknown as ListTareasQuery;
    const { page, limit, sort } = query;
    const skip = (page - 1) * limit;

    const where = buildTareasWhere(query, usuario);

    const queryParaResumen = { ...query, todo: true };
    delete (queryParaResumen as any).estado;
    delete (queryParaResumen as any).atrasadas;
    delete (queryParaResumen as any).notificado;

    const whereParaResumen = buildTareasWhere(queryParaResumen, usuario);
    const orderBy = (sort ?? [{ createdAt: "desc" }]) as Prisma.TareaOrderByWithRelationInput[];

    const [total, tareas, counts, totalAtrasadas, totalActivas, totalCerradas, totalNotificados, totalSinNotificar] =
      await prisma.$transaction([
        prisma.tarea.count({ where }),

        prisma.tarea.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: {
            imagenes: { orderBy: { orden: "asc" } },
            asignaciones: {
              include: { usuario: { select: USUARIO_SELECT_BASICO } },
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
            creadoPor: { select: USUARIO_SELECT_BASICO },
            organizadoPor: { select: { id: true, nombre: true } },
            notas: {
              orderBy: { createdAt: "desc" },
              include: { creadoPor: { select: { id: true, nombre: true, imagen: true } } },
            },
          },
        }),

        prisma.tarea.groupBy({
          by: ["estado"],
          where: {
            ...whereParaResumen,
            OR: [{ estado: { notIn: [EstadoTarea.CERRADA] } }, { estado: null }],
            tipo: TipoEntrada.TAREA
          },
          _count: { _all: true },
          orderBy: { estado: 'asc' }
        }),

        prisma.tarea.count({
          where: {
            ...whereParaResumen,
            fechaVencimiento: { lt: new Date() },
            tipo: TipoEntrada.TAREA,
            OR: [{ estado: { notIn: [EstadoTarea.CERRADA, EstadoTarea.CANCELADA] } }, { estado: null }]
          }
        }),

        prisma.tarea.count({
          where: {
            ...whereParaResumen,
            tipo: TipoEntrada.TAREA,
            estado: { in: [EstadoTarea.PENDIENTE, EstadoTarea.EN_REVISION] }
          }
        }),

        prisma.tarea.count({
          where: {
            ...whereParaResumen,
            tipo: TipoEntrada.TAREA,
            estado: EstadoTarea.CERRADA
          }
        }),

        prisma.tarea.count({
          where: {
            ...whereParaResumen,
            notificadoAt: { not: null }
          }
        }),

        prisma.tarea.count({
          where: {
            ...whereParaResumen,
            notificadoAt: null
          }
        })
      ]);

    const countsObj = counts.reduce((acc, curr: any) => {
      if (curr.estado) {
        acc[curr.estado] = curr._count?._all || 0;
      }
      return acc;
    }, {} as Record<string, number>);

    countsObj['CERRADA'] = totalCerradas;

    const ultimasDosJuntas = await prisma.minuta.findMany({
      where: { estado: { in: ["ACTIVA", "CERRADA"] } },
      orderBy: { fechaRealizada: "desc" },
      take: 2,
      select: { id: true },
    });
    const ultimaJuntaId = ultimasDosJuntas[0]?.id ?? null;
    const juntaAnteriorId = ultimasDosJuntas[1]?.id ?? null;

    const groupedParams = tareas
      .filter((t: any) => t.tipo === TipoEntrada.TAREA && t.minutaId && t.organizadoAt)
      .map((t: any) => ({ minutaId: t.minutaId, organizadoAt: t.organizadoAt }));

    const uniqueGroups = Array.from(new Set(groupedParams.map((p) => JSON.stringify(p)))).map((p) => JSON.parse(p as string));

    let hermanasRaw: any[] = [];
    if (uniqueGroups.length > 0) {
      hermanasRaw = await prisma.tarea.findMany({
        where: {
          AND: [
            {
              OR: uniqueGroups.map((g: any) => ({
                minutaId: g.minutaId,
                organizadoAt: new Date(g.organizadoAt),
                tipo: TipoEntrada.TAREA,
              })),
            },
            {
              estado: { notIn: [EstadoTarea.CANCELADA] },
              tipo: { notIn: [TipoEntrada.DESCARTADA] },
            }
          ]
        },
        select: {
          id: true,
          minutaId: true,
          organizadoAt: true,
          asignaciones: {
            include: { usuario: { select: USUARIO_SELECT_BASICO } },
          },
        },
      });
    }

    const now = new Date();
    const tareasConMeta = tareas.map((t: any) => {
      let _grupoContext = null;
      if (t.tipo === TipoEntrada.TAREA && t.minutaId && t.organizadoAt) {
        const hermanas = hermanasRaw.filter((h: any) => h.minutaId === t.minutaId && new Date(h.organizadoAt).getTime() === new Date(t.organizadoAt).getTime());
        if (hermanas.length > 1) {
          const otrosResponsables = hermanas
            .filter((h: any) => h.id !== t.id)
            .flatMap((h: any) => h.asignaciones.map((a: any) => a.usuario));
          _grupoContext = {
            total: hermanas.length,
            otrosResponsables,
          };
        }
      }

      return {
        ...t,
        isOverdue:
          t.fechaVencimiento &&
          new Date(t.fechaVencimiento) < now &&
          !['CERRADA', 'CANCELADA'].includes(t.estado),
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
        _grupoContext,
      };
    });

    return res.json({
      status: "success",
      data: {
        total,
        totalFiltrado: totalActivas,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        counts: countsObj,
        totalAtrasadas,
        totalNotificados,
        totalSinNotificar,
        tareas: tareasConMeta,
      },
    });
  } catch (error) {
    await registrarError("LISTAR_TAREAS", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al listar entradas organizacionales" });
  }
};
