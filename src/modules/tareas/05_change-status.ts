// minutas-backend/src/modules/tareas/05_change-status.ts

import type { Request, Response } from "express";

import { prisma } from "../../db";

import {
  EstadoTarea,
  EstadoAsignacion,
  EstadoOperativo,
  EstadoConceptual,
  Rol,
} from "@prisma/client";

import {
  registrarAccion,
  registrarError,
} from "../../utils/logger";

import {
  registrarCambio,
  evaluarEstadoMinuta,
} from "./helpers";

import { getIO } from "../../utils/socket";

import type {
  ChangeEstadoInput,
  ChangeEstadoParams,
} from "./zod";

export const changeEstadoTarea = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = req.user!.id;

    const rolUsuario = req.user!.rol;

    const { id } =
      req.params as unknown as ChangeEstadoParams;

    const { estado } =
      req.body as ChangeEstadoInput;

    const tarea =
      await prisma.tarea.findUnique({
        where: { id },

        include: {
          asignaciones: true,
        },
      });

    if (!tarea) {
      return res.status(404).json({
        error: "Tarea no encontrada",
      });
    }

    const rolesJefatura: Rol[] = [
      Rol.GERENCIA,
      Rol.JEFE,
    ];

    const esJefeOGerente =
      rolesJefatura.includes(rolUsuario);

    if (
      tarea.isExternalArea &&
      !esJefeOGerente
    ) {
      return res.status(403).json({
        error:
          "Las tareas externas no pueden ser modificadas por coordinadores.",
      });
    }

    const asignacionDelUsuario =
      tarea.asignaciones.find(
        (a) => a.usuarioId === usuarioId
      );

    if (!esJefeOGerente) {
      if (!asignacionDelUsuario) {
        return res.status(403).json({
          error:
            "No tienes esta tarea asignada.",
        });
      }

      const estadoAsig =
        estado === EstadoTarea.COMPLETADO
          ? EstadoAsignacion.COMPLETADO
          : estado === EstadoTarea.EN_PROGRESO
          ? EstadoAsignacion.EN_PROGRESO
          : EstadoAsignacion.PENDIENTE;

      await prisma.tareaAsignacion.update({
        where: {
          id: asignacionDelUsuario.id,
        },

        data: {
          estado: estadoAsig,

          completadoAt:
            estadoAsig ===
            EstadoAsignacion.COMPLETADO
              ? new Date()
              : null,
        },
      });

      const asignacionesActualizadas =
        await prisma.tareaAsignacion.findMany({
          where: {
            tareaId: id,
          },
        });

      const todosCompletaron =
        asignacionesActualizadas.length > 0 &&
        asignacionesActualizadas.every(
          (a) =>
            a.estado ===
            EstadoAsignacion.COMPLETADO
        );

      const algunEnProgreso =
        asignacionesActualizadas.some(
          (a) =>
            a.estado ===
            EstadoAsignacion.EN_PROGRESO
        );

      let nuevoEstadoGlobal: EstadoTarea = tarea.estado;

      let nuevoEstadoOperativo:
        | EstadoOperativo
        | null = EstadoOperativo.PENDIENTE;

      if (todosCompletaron) {
        nuevoEstadoGlobal =
          EstadoTarea.COMPLETADO;

        nuevoEstadoOperativo =
          EstadoOperativo.COMPLETADO;
      } else if (algunEnProgreso) {
        nuevoEstadoGlobal =
          EstadoTarea.EN_PROGRESO;

        nuevoEstadoOperativo =
          EstadoOperativo.EN_PROGRESO;
      }

      await prisma.tarea.update({
        where: { id },

        data: {
          estado: nuevoEstadoGlobal,

          estadoOperativo:
            nuevoEstadoOperativo,

          estadoConceptual:
            nuevoEstadoGlobal ===
            EstadoTarea.COMPLETADO
              ? EstadoConceptual.CERRADO
              : tarea.estadoConceptual,

          completadoAt:
            nuevoEstadoGlobal ===
            EstadoTarea.COMPLETADO
              ? new Date()
              : null,
        },
      });

      if (nuevoEstadoGlobal !== tarea.estado) {
        await registrarCambio(
          id,
          usuarioId,
          "estado",
          tarea.estado,
          nuevoEstadoGlobal
        );
      }
    } else {
      const dataUpdate: Record<string, any> = {
        estado,
      };

      if (
        estado === EstadoTarea.EN_PROGRESO
      ) {
        dataUpdate.estadoOperativo =
          EstadoOperativo.EN_PROGRESO;
      }

      if ((estado as EstadoTarea) === EstadoTarea.COMPLETADO) {
        dataUpdate.estadoOperativo =
          EstadoOperativo.COMPLETADO;

        dataUpdate.estadoConceptual =
          EstadoConceptual.CERRADO;

        dataUpdate.completadoAt =
          new Date();
      }

      if (
        estado === EstadoTarea.CERRADO
      ) {
        dataUpdate.cerradoAt =
          new Date();
      }

      await prisma.tarea.update({
        where: { id },
        data: dataUpdate,
      });

      await registrarCambio(
        id,
        usuarioId,
        "estado",
        tarea.estado,
        estado
      );
    }

    if (tarea.minutaId) {
      await evaluarEstadoMinuta(
        tarea.minutaId
      );
    }

    await registrarAccion(
      "CAMBIO_ESTADO_TAREA",
      usuarioId,
      `Cambio de estado en tarea ${id}`
    );

    const tareaActualizada =
      await prisma.tarea.findUnique({
        where: { id },

        include: {
          asignaciones: {
            include: {
              usuario: {
                select: {
                  nombre: true,
                  imagen: true,
                },
              },
            },
          },

          minuta: {
            select: {
              id: true,
              titulo: true,
              estado: true,
            },
          },

          notas: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      });

    try {
      getIO()
        .to("global_updates")
        .emit("tarea_estado_cambiado", {
          tareaId: id,
        });
    } catch (_) {}

    return res.json({
      status: "success",
      data: tareaActualizada,
    });
  } catch (error) {
    await registrarError(
      "CAMBIO_ESTADO_TAREA",
      req.user?.id ?? null,
      error
    );

    return res.status(500).json({
      error: "Error al cambiar estado",
    });
  }
};