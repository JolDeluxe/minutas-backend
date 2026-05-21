// minutas-backend/src/modules/tareas/05_change-status.ts

import type { Request, Response } from "express";
import { prisma } from "../../db";
import {
  EstadoTarea,
  Rol,
  TipoEntrada,
  TipoNotificacion,
} from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { registrarCambio, evaluarEstadoMinuta } from "./helpers";
import { getIO } from "../../utils/socket";
import type { ChangeEstadoInput, ChangeEstadoParams } from "./zod";

export const changeEstadoTarea = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const rolUsuario = req.user!.rol;
    const { id } = req.params as unknown as ChangeEstadoParams;
    const { estado } = req.body as ChangeEstadoInput;

    const tarea = await prisma.tarea.findUnique({
      where: { id },
      include: {
        asignaciones: true,
      },
    });

    if (!tarea) {
      return res.status(404).json({ error: "Entrada no encontrada" });
    }

    if (tarea.tipo !== TipoEntrada.TAREA) {
      return res.status(400).json({ error: "Solo las entradas clasificadas como TAREA tienen flujo de estados" });
    }

    const esJefeOGerente = [Rol.GERENCIA as string, Rol.JEFE as string].includes(rolUsuario);

    // ── LÓGICA DE TRANSICIONES ──────────────────────────────────
    if (!esJefeOGerente) {
      // Regla Coordinador: Solo puede enviar a EN_REVISION si está PENDIENTE
      const asignado = tarea.asignaciones.some(a => a.usuarioId === usuarioId);
      if (!asignado) {
        return res.status(403).json({ error: "No tienes esta tarea asignada." });
      }

      if (estado !== EstadoTarea.EN_REVISION) {
        return res.status(403).json({
           error: "Como coordinador, solo puedes enviar la tarea a revisión.",
        });
      }

      if (tarea.estado === EstadoTarea.CERRADA || tarea.estado === EstadoTarea.CANCELADA) {
         return res.status(400).json({ error: "La tarea ya está cerrada o cancelada." });
      }
    } else {
      // Jefatura / Gerencia
      // Tienen libertad de mover entre PENDIENTE, EN_REVISION, CERRADA, CANCELADA.
      if (tarea.estado === EstadoTarea.CERRADA || tarea.estado === EstadoTarea.CANCELADA) {
          // Generalmente las cerradas no se reabren, pero si el jefe lo fuerza, se lo permitimos o lo bloqueamos.
          // Por seguridad vamos a bloquearlo a menos que sea un requerimiento específico.
          if (estado !== EstadoTarea.CERRADA && estado !== EstadoTarea.CANCELADA) {
              return res.status(400).json({ error: "No se puede reabrir una tarea que ya ha sido finalizada." });
          }
      }
    }

    const dataUpdate: Record<string, any> = { estado };

    if (estado === EstadoTarea.CERRADA) {
      dataUpdate.completadoAt = new Date();
      dataUpdate.cerradoAt = new Date();
    } else if (estado === EstadoTarea.CANCELADA) {
      dataUpdate.cerradoAt = new Date();
    } else {
      dataUpdate.completadoAt = null;
      dataUpdate.cerradoAt = null;
    }

    await prisma.$transaction(async (tx) => {
        await tx.tarea.update({
          where: { id },
          data: dataUpdate,
        });

        // Notificaciones según el estado
        if (estado === EstadoTarea.EN_REVISION && tarea.organizadoPorId) {
             await tx.notificacion.create({
                 data: {
                     usuarioId: tarea.organizadoPorId,
                     tipo: TipoNotificacion.TAREA_EN_REVISION,
                     titulo: 'Tarea en Revisión',
                     cuerpo: `El equipo ha marcado la tarea como completada y espera tu revisión.`,
                     tareaId: id
                 }
             });
        } else if (estado === EstadoTarea.CERRADA || estado === EstadoTarea.CANCELADA) {
             // Notificar a los asignados
             for (const asig of tarea.asignaciones) {
                 await tx.notificacion.create({
                     data: {
                         usuarioId: asig.usuarioId,
                         tipo: estado === EstadoTarea.CERRADA ? TipoNotificacion.TAREA_CERRADA : TipoNotificacion.TAREA_CANCELADA,
                         titulo: estado === EstadoTarea.CERRADA ? 'Tarea Cerrada' : 'Tarea Cancelada',
                         cuerpo: `La tarea ha sido ${estado === EstadoTarea.CERRADA ? 'cerrada aprobada' : 'cancelada'} por el gerente.`,
                         tareaId: id
                     }
                 });
             }
        }
    });

    if (estado !== tarea.estado) {
      await registrarCambio(id, usuarioId, "estado", tarea.estado, estado);
    }

    if (tarea.minutaId) {
      await evaluarEstadoMinuta(tarea.minutaId);
    }

    await registrarAccion("CAMBIO_ESTADO_TAREA", usuarioId, `Tarea ${id} movida a ${estado}`);

    const tareaActualizada = await prisma.tarea.findUnique({
      where: { id },
      include: {
        asignaciones: {
          include: {
            usuario: {
              select: { id: true, nombre: true, username: true, imagen: true, rol: true, linea: true },
            },
          },
        },
        minuta: {
          select: { id: true, titulo: true, estado: true },
        },
        notas: { orderBy: { createdAt: "desc" } },
      },
    });

    try {
      getIO().to("global_updates").emit("tarea_estado_cambiado", { tareaId: id });
    } catch (_) {}

    return res.json({ status: "success", data: tareaActualizada });
  } catch (error) {
    await registrarError("CAMBIO_ESTADO_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al cambiar estado" });
  }
};