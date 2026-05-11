import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";

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

    const where =
      buildTareasWhere(query, usuario);

    const orderBy =
      (sort ??
        [{ createdAt: "desc" }]) as Prisma.TareaOrderByWithRelationInput[];

    const [total, tareas] =
      await prisma.$transaction([
        prisma.tarea.count({
          where,
        }),

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
      ]);

    return res.json({
      status: "success",

      data: {
        total,

        page,

        limit,

        totalPages:
          Math.ceil(total / limit),

        tareas,
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