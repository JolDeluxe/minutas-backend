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

    const whereParaResumen = buildTareasWhere(queryParaResumen, usuario);
    const orderBy = (sort ?? [{ createdAt: "desc" }]) as Prisma.TareaOrderByWithRelationInput[];

    const [total, tareas, counts, totalAtrasadas, totalActivas, totalCerradas] =
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

    const now = new Date();
    const tareasConMeta = tareas.map((t: any) => ({
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
    }));

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
        tareas: tareasConMeta,
      },
    });
  } catch (error) {
    await registrarError("LISTAR_TAREAS", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al listar entradas organizacionales" });
  }
};
