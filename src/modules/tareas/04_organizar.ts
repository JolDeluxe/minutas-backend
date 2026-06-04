// minutas-backend/src/modules/tareas/04_organizar.ts

import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol, EstadoTarea, TipoEntrada } from "@prisma/client";
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
        imagenes: { select: { url: true, publicId: true, orden: true, tipo: true } },
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

    // ── LÓGICA DE DIVISIÓN POR RESPONSABLE ────────────────────────────────
    // Solo aplica cuando:
    //   1. El tipo destino es TAREA
    //   2. Se enviaron más de 1 responsable
    const responsablesIds: number[] = datos.responsables ?? [];
    const esMultiResponsable =
      datos.tipo === TipoEntrada.TAREA && responsablesIds.length > 1;

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
    
    if (datos.tipo !== tareaActual.tipo) {
        historial.push({ campo: "tipo", antes: tareaActual.tipo, despues: datos.tipo });
    }

    // ─────────────────────────────────────────────────────────────────────
    // CASO A: TAREA con múltiples responsables → clonar un registro por cada uno
    // ─────────────────────────────────────────────────────────────────────
    if (esMultiResponsable) {
      const organizadoAt = data.organizadoAt as Date;

      // IDs de las tareas clonadas (empezando por la original)
      const tareasCreadas: number[] = [];

      await prisma.$transaction(async (tx) => {
        // 1. Actualizar el registro original con los datos del PRIMER responsable.
        //    Eliminar todas las asignaciones previas de la original.
        await tx.tareaAsignacion.deleteMany({ where: { tareaId: id } });
        await tx.tarea.update({ where: { id }, data });
        await tx.tareaAsignacion.create({
          data: { tareaId: id, usuarioId: responsablesIds[0]!, asignadoPorId: usuarioId },
        });
        tareasCreadas.push(id);

        // 2. Crear una copia por cada responsable adicional (#2 … #N)
        for (let i = 1; i < responsablesIds.length; i++) {
          const clon = await tx.tarea.create({
            data: {
              descripcion: tareaActual.descripcion,
              departamento: tareaActual.departamento,
              area: tareaActual.area,
              linea: tareaActual.linea,
              clasificacion: tareaActual.clasificacion,
              minutaId: tareaActual.minutaId,
              creadoPorId: tareaActual.creadoPorId,
              organizadoPorId: usuarioId,
              organizadoAt,
              tipo: TipoEntrada.TAREA,
              estado: (data.estado as EstadoTarea) ?? EstadoTarea.PENDIENTE,
              prioridad: data.prioridad ?? null,
              fechaVencimiento: data.fechaVencimiento ?? null,
            },
          });

          // Asignar al responsable correspondiente
          await tx.tareaAsignacion.create({
            data: { tareaId: clon.id, usuarioId: responsablesIds[i]!, asignadoPorId: usuarioId },
          });

          // Clonar imágenes de captura de la entrada original
          if (tareaActual.imagenes.length > 0) {
            await tx.tareaImagen.createMany({
              data: tareaActual.imagenes.map((img) => ({
                tareaId: clon.id,
                url: img.url,
                publicId: img.publicId,
                orden: img.orden,
                tipo: img.tipo,
              })),
              skipDuplicates: true,
            });
          }

          tareasCreadas.push(clon.id);
        }
      });

      // Registrar historial y bitácora
      if (historial.length > 0) {
        await Promise.all(
          historial.map((h) => registrarCambio(id, usuarioId, h.campo, h.antes, h.despues))
        );
      }
      await registrarAccion(
        "ORGANIZAR_ENTRADA",
        usuarioId,
        `Entrada ${id} dividida en ${tareasCreadas.length} tareas individuales (responsables: ${responsablesIds.join(", ")})`
      );

      // Notificar a cada responsable
      for (let i = 0; i < tareasCreadas.length; i++) {
        await notificarAsignacion(
          tareasCreadas[i]!,
          [responsablesIds[i]!],
          tareaActual.descripcion,
          tareaActual.linea
        );
      }

      // Reevaluar estado de la minuta
      if (tareaActual.minutaId) {
        await evaluarEstadoMinuta(tareaActual.minutaId, usuarioId);
      }

      // Devolver la tarea original actualizada (el frontend refrescará todo)
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

      return res.json({ status: "success", data: tareaActualizada, clonadas: tareasCreadas.length });
    }

    // ─────────────────────────────────────────────────────────────────────
    // CASO B: Flujo normal (0 o 1 responsable, o tipo distinto de TAREA)
    // ─────────────────────────────────────────────────────────────────────
    let idsAgregar: number[] = [];

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
