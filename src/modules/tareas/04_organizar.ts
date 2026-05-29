// minutas-backend/src/modules/tareas/04_organizar.ts

import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol, EstadoTarea, TipoEntrada, TipoNotificacion } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { registrarCambio, normalizarFechaVencimiento, evaluarEstadoMinuta } from "./helpers";
import { notificarAsignacion, notificarTareaDescartada } from "../notificaciones/services";
import type { OrganizarTareaInput, OrganizarTareaParams } from "./zod";

export const organizarTarea = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const rolUsuario = req.user!.rol;
    const { id } = req.params as unknown as OrganizarTareaParams;
    const datos = req.body as OrganizarTareaInput;

    if (rolUsuario === Rol.COORDINADOR) {
        return res.status(403).json({
          error: "No tienes permisos para organizar entradas",
        });
    }

    const tareaActual = await prisma.tarea.findUnique({
      where: { id },
      include: {
        asignaciones: { select: { id: true, usuarioId: true } },
      },
    });

    if (!tareaActual) {
      return res.status(404).json({ error: "Entrada no encontrada" });
    }

    if (tareaActual.estado === EstadoTarea.CERRADA || tareaActual.estado === EstadoTarea.CANCELADA) {
      return res.status(400).json({
        error: "Esta entrada ya ha sido cerrada o cancelada y no puede ser organizada",
      });
    }

    const data: Record<string, any> = {
        tipo: datos.tipo,
        organizadoPorId: usuarioId,
        organizadoAt: new Date()
    };
    
    // Auto-resolve states based on type
    if (datos.tipo === TipoEntrada.TAREA) {
        data.estado = datos.estado ?? EstadoTarea.PENDIENTE;
        data.prioridad = datos.prioridad ?? null;
        if (datos.fechaVencimiento !== undefined) {
            data.fechaVencimiento = normalizarFechaVencimiento(datos.fechaVencimiento);
        }
    } else if (datos.tipo === TipoEntrada.RECORDATORIO) {
        data.alcanceRecordatorio = datos.alcanceRecordatorio ?? null;
        data.estado = null;
        data.prioridad = null;
        data.fechaVencimiento = null;
    } else {
        // POLITICA / DESCARTADA / SIN_ORGANIZAR
        data.estado = null;
        data.prioridad = null;
        data.fechaVencimiento = null;
        data.alcanceRecordatorio = null;
    }

    const historial: { campo: string; antes: string | null; despues: string | null; }[] = [];
    let idsAgregar: number[] = [];
    
    if (datos.tipo !== tareaActual.tipo) {
        historial.push({ campo: "tipo", antes: tareaActual.tipo, despues: datos.tipo });
    }

    await prisma.$transaction(async (tx) => {
      if (datos.responsables !== undefined && (datos.tipo === TipoEntrada.TAREA || datos.tipo === TipoEntrada.RECORDATORIO)) {
        const idsActuales = new Set(tareaActual.asignaciones.map((a) => a.usuarioId));
        const idsNuevos = new Set(datos.responsables);
        idsAgregar = datos.responsables.filter((uid) => !idsActuales.has(uid));
        const idsEliminar = tareaActual.asignaciones.filter((a) => !idsNuevos.has(a.usuarioId)).map((a) => a.id);

        if (idsEliminar.length > 0) {
          await tx.tareaAsignacion.deleteMany({ where: { id: { in: idsEliminar } } });
        }

        if (idsAgregar.length > 0) {
          await tx.tareaAsignacion.createMany({
            data: idsAgregar.map((uid) => ({ tareaId: id, usuarioId: uid, asignadoPorId: usuarioId })),
            skipDuplicates: true,
          });
        }
      } else if (datos.tipo === TipoEntrada.POLITICA || datos.tipo === TipoEntrada.DESCARTADA) {
         // Eliminar asignaciones si no aplican
         if (tareaActual.asignaciones.length > 0) {
             await tx.tareaAsignacion.deleteMany({ where: { tareaId: id } });
         }
      }

      await tx.tarea.update({ where: { id }, data });
    });

    if (historial.length > 0) {
      await Promise.all(
        historial.map((h) => registrarCambio(id, usuarioId, h.campo, h.antes, h.despues))
      );
    }

    await registrarAccion("ORGANIZAR_ENTRADA", usuarioId, `Entrada organizacional ${id} clasificada como ${datos.tipo}`);

    // Reevaluar estado de la minuta
    if (tareaActual.minutaId) {
      await evaluarEstadoMinuta(tareaActual.minutaId, usuarioId);
    }

    const tareaActualizada = await prisma.tarea.findUnique({
      where: { id },
      include: {
        imagenes: { orderBy: { orden: "asc" } },
        asignaciones: { include: { usuario: { select: { id: true, nombre: true, username: true, imagen: true, rol: true, linea: true } } } },
        creadoPor: { select: { id: true, nombre: true, username: true, imagen: true, linea: true } },
        minuta: { select: { id: true, titulo: true, estado: true } },
        notas: { orderBy: { createdAt: "desc" } },
      },
    });

    if (datos.tipo === TipoEntrada.DESCARTADA && tareaActual.tipo === TipoEntrada.TAREA) {
      await notificarTareaDescartada(id, tareaActual.descripcion, usuarioId);
    } else if (idsAgregar.length > 0 && datos.tipo === TipoEntrada.TAREA && tareaActualizada) {
      await notificarAsignacion(id, idsAgregar, tareaActualizada.descripcion, tareaActualizada.linea);
    }

    return res.json({ status: "success", data: tareaActualizada });
  } catch (error) {
    await registrarError("ORGANIZAR_ENTRADA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al organizar la entrada" });
  }
};
