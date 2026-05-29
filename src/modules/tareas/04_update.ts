// minutas-backend/src/modules/tareas/04_update.ts

import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol, EstadoTarea } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { registrarCambio, normalizarFechaVencimiento, evaluarEstadoMinuta } from "./helpers";
import { notificarAsignacion, notificarTareaActualizada } from "../notificaciones/services";
import type { UpdateTareaInput, UpdateTareaParams } from "./zod";

export const updateTarea = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const rolUsuario = req.user!.rol;
    const { id } = req.params as unknown as UpdateTareaParams;
    const datos = req.body as UpdateTareaInput;

    const camposFase2: (keyof UpdateTareaInput)[] = [
      "tipo", "estado", "alcanceRecordatorio", "prioridad", "fechaVencimiento", "responsables"
    ];

    if (rolUsuario === Rol.COORDINADOR) {
      const intentaCambiarFase2 = camposFase2.some((c) => datos[c] !== undefined);
      if (intentaCambiarFase2) {
        return res.status(403).json({
          error: "No tienes permisos para modificar campos de organización post-junta",
        });
      }
    }

    const tareaActual = await prisma.tarea.findUnique({
      where: { id },
      include: {
        asignaciones: {
          select: { id: true, usuarioId: true },
        },
      },
    });

    if (!tareaActual) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    if (tareaActual.estado === EstadoTarea.CERRADA || tareaActual.estado === EstadoTarea.CANCELADA) {
      return res.status(400).json({
        error: "Esta entrada ya ha sido cerrada o cancelada y no puede ser modificada",
      });
    }

    const data: Record<string, any> = {};
    const historial: { campo: string; antes: string | null; despues: string | null; }[] = [];

    const verificarYRegistrar = (campo: keyof UpdateTareaInput, valorNuevo: any, valorActual: any) => {
        if (valorNuevo !== undefined && valorNuevo !== valorActual) {
            historial.push({ campo, antes: String(valorActual ?? null), despues: String(valorNuevo ?? null) });
            data[campo] = valorNuevo;
        }
    }

    verificarYRegistrar("descripcion", datos.descripcion, tareaActual.descripcion);
    verificarYRegistrar("area", datos.area, tareaActual.area);
    verificarYRegistrar("linea", datos.linea, tareaActual.linea);
    verificarYRegistrar("clasificacion", datos.clasificacion, tareaActual.clasificacion);
    verificarYRegistrar("prioridad", datos.prioridad, tareaActual.prioridad);
    verificarYRegistrar("tipo", datos.tipo, tareaActual.tipo);
    verificarYRegistrar("estado", datos.estado, tareaActual.estado);
    verificarYRegistrar("alcanceRecordatorio", datos.alcanceRecordatorio, tareaActual.alcanceRecordatorio);
    
    if (datos.fechaVencimiento !== undefined) {
      const nuevaFecha = normalizarFechaVencimiento(datos.fechaVencimiento);
      const antes = tareaActual.fechaVencimiento?.toISOString() ?? null;
      const despues = nuevaFecha?.toISOString() ?? null;
      if (antes !== despues) {
        historial.push({ campo: "fechaVencimiento", antes, despues });
        data.fechaVencimiento = nuevaFecha;
      }
    }

    let idsAgregar: number[] = [];

    await prisma.$transaction(async (tx) => {
      // Manejo de responsables
      if (datos.responsables !== undefined) {
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
      }

      if (Object.keys(data).length > 0) {
        await tx.tarea.update({ where: { id }, data });
      }
    });

    if (historial.length > 0) {
      await Promise.all(
        historial.map((h) => registrarCambio(id, usuarioId, h.campo, h.antes, h.despues))
      );
    }

    await registrarAccion("ACTUALIZAR_TAREA", usuarioId, `Entrada organizacional ${id}`);

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

    if (tareaActualizada) {
      if (idsAgregar.length > 0) {
        await notificarAsignacion(id, idsAgregar, tareaActualizada.descripcion, tareaActualizada.linea);
      }
      if (historial.length > 0) {
        const idsResponsablesNuevosExcluidos = tareaActualizada.asignaciones
          .map((a) => a.usuarioId)
          .filter((uid) => !idsAgregar.includes(uid));

        if (idsResponsablesNuevosExcluidos.length > 0) {
          await notificarTareaActualizada(id, tareaActualizada.descripcion, idsResponsablesNuevosExcluidos, usuarioId);
        }
      }
    }

    return res.json({ status: "success", data: tareaActualizada });
  } catch (error) {
    await registrarError("ACTUALIZAR_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al actualizar tarea" });
  }
};