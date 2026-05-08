// minutas-backend/src/modules/tareas/03_get-by-id.ts

import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
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
              select: {
                id: true,
                nombre: true,
                username: true,
                imagen: true,
                rol: true,
                area: true,
                linea: true,
              },
            },
          },
        },

        creadoPor: {
          select: {
            id: true,
            nombre: true,
            username: true,
            imagen: true,
          },
        },

        formalizadoPor: {
          select: {
            id: true,
            nombre: true,
            username: true,
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

        notas: {
          orderBy: {
            createdAt: "desc",
          },
        },

        historial: {
          orderBy: {
            createdAt: "desc",
          },

          take: 50,

          include: {
            usuario: {
              select: {
                id: true,
                nombre: true,
                username: true,
              },
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