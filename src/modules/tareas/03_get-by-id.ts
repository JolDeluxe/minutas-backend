// minutas-backend/src/modules/tareas/03_get-by-id.ts

import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import { USUARIO_SELECT_BASICO, USUARIO_SELECT_MINIMO } from "../shared-selects";
import type { TareaIdParams } from "./zod";

export const getTareaById = async (
  req: Request,
  res: Response
) => {
  try {
    const usuario = req.user!;

    const { id } =
      req.params as unknown as TareaIdParams;

    const tarea = await prisma.tarea.findUnique({
      where: { id },

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

        creadoPor: {
          select: USUARIO_SELECT_BASICO,
        },

        organizadoPor: {
          select: USUARIO_SELECT_MINIMO,
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

        notas: {
          orderBy: {
            createdAt: "desc",
          },
          include: {
            creadoPor: {
              select: {
                id: true,
                nombre: true,
                imagen: true,
              },
            },
          },
        },

        historial: {
          orderBy: {
            createdAt: "desc",
          },

          take: 50,

          include: {
            usuario: {
              select: USUARIO_SELECT_MINIMO,
            },
          },
        },
      },
    });

    if (!tarea) {
      return res.status(404).json({
        error: "Tarea no encontrada",
      });
    }

    if (
      usuario.rol === "COORDINADOR"
      &&
      !tarea.asignaciones.some(
        (a) => a.usuarioId === usuario.id
      )
    ) {
      return res.status(403).json({
        error: "No tienes acceso a esta tarea",
      });
    }

    return res.json({
      status: "success",
      data: tarea,
    });
  } catch (error) {
    await registrarError(
      "GET_TAREA_BY_ID",
      req.user?.id ?? null,
      error
    );

    return res.status(500).json({
      error: "Error al obtener tarea",
    });
  }
};