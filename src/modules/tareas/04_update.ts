import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Area, Linea, Prioridad, Clasificacion } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { calcularIsExternalArea, calcularCapturaCompleta, registrarCambio } from "./helpers";
import type { UpdateTareaInput, UpdateTareaParams } from "./zod";

export const updateTarea = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { id }    = req.params as unknown as UpdateTareaParams;
    const datos     = req.body as UpdateTareaInput;

    const tareaActual = await prisma.tarea.findUnique({
      where: { id },
      include: { asignaciones: { select: { id: true, usuarioId: true } } },
    });

    if (!tareaActual) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    if (datos.minutaId !== undefined && datos.minutaId !== null) {
      const minuta = await prisma.minuta.findUnique({ where: { id: datos.minutaId } });
      if (!minuta) return res.status(404).json({ error: "Minuta no encontrada" });
    }

    const data: Record<string, any> = {};
    const historial: { campo: string; antes: string | null; despues: string | null }[] = [];

    if (datos.descripcion !== undefined && datos.descripcion !== tareaActual.descripcion) {
      historial.push({ campo: "descripcion", antes: tareaActual.descripcion, despues: datos.descripcion });
      data.descripcion = datos.descripcion;
    }

    if (datos.prioridad !== undefined) {
      const val = (datos.prioridad ?? null) as Prioridad | null;
      if (val !== tareaActual.prioridad) {
        historial.push({ campo: "prioridad", antes: tareaActual.prioridad, despues: val });
        data.prioridad = val;
      }
    }

    if (datos.linea !== undefined) {
      const val = (datos.linea ?? null) as Linea | null;
      if (val !== tareaActual.linea) {
        historial.push({ campo: "linea", antes: tareaActual.linea, despues: val });
        data.linea = val;
      }
    }

    if (datos.clasificacion !== undefined) {
      const val = (datos.clasificacion ?? null) as Clasificacion | null;
      if (val !== tareaActual.clasificacion) {
        historial.push({ campo: "clasificacion", antes: tareaActual.clasificacion, despues: val });
        data.clasificacion = val;
      }
    }

    if (datos.minutaId !== undefined && datos.minutaId !== tareaActual.minutaId) {
      historial.push({
        campo:   "minutaId",
        antes:   tareaActual.minutaId !== null ? String(tareaActual.minutaId) : null,
        despues: datos.minutaId       !== null ? String(datos.minutaId)       : null,
      });
      data.minutaId = datos.minutaId;
    }

    if (datos.area !== undefined) {
      const val = (datos.area ?? null) as Area | null;
      if (val !== tareaActual.area) {
        historial.push({ campo: "area", antes: tareaActual.area, despues: val });
        data.area            = val;
        data.isExternalArea  = calcularIsExternalArea(val);
      }
    }

    if (datos.fechaVencimiento !== undefined) {
      const nuevaFecha  = datos.fechaVencimiento ? new Date(datos.fechaVencimiento) : null;
      const antesStr    = tareaActual.fechaVencimiento?.toISOString() ?? null;
      const despuesStr  = nuevaFecha?.toISOString() ?? null;
      if (antesStr !== despuesStr) {
        historial.push({ campo: "fechaVencimiento", antes: antesStr, despues: despuesStr });
        data.fechaVencimiento = nuevaFecha;
      }
    }

    let totalAsignacionesFinal = tareaActual.asignaciones.length;

    if (datos.responsables !== undefined) {
      const idsActuales = new Set(tareaActual.asignaciones.map((a) => a.usuarioId));
      const idsNuevos   = new Set(datos.responsables);
      const idsAgregar  = datos.responsables.filter((uid) => !idsActuales.has(uid));
      const idsEliminar = tareaActual.asignaciones
        .filter((a) => !idsNuevos.has(a.usuarioId))
        .map((a) => a.id);

      if (idsAgregar.length > 0 || idsEliminar.length > 0) {
        historial.push({
          campo:   "responsables",
          antes:   JSON.stringify([...idsActuales]),
          despues: JSON.stringify([...idsNuevos]),
        });

        if (idsEliminar.length > 0) {
          await prisma.tareaAsignacion.deleteMany({ where: { id: { in: idsEliminar } } });
        }
        if (idsAgregar.length > 0) {
          await prisma.tareaAsignacion.createMany({
            data: idsAgregar.map((uid) => ({ tareaId: id, usuarioId: uid })),
            skipDuplicates: true,
          });
        }
        totalAsignacionesFinal = datos.responsables.length;
      }
    }

    const clasificacionFinal  = data.clasificacion    !== undefined ? data.clasificacion    : tareaActual.clasificacion;
    const fechaFinal          = data.fechaVencimiento !== undefined ? data.fechaVencimiento : tareaActual.fechaVencimiento;
    
    const nuevaCapturaCompleta = calcularCapturaCompleta({
      clasificacion:     clasificacionFinal,
      fechaVencimiento:  fechaFinal,
      totalAsignaciones: totalAsignacionesFinal,
    });

    if (nuevaCapturaCompleta !== tareaActual.capturaCompleta) {
      data.capturaCompleta = nuevaCapturaCompleta;
    }

    if (Object.keys(data).length > 0) {
      await prisma.tarea.update({ where: { id }, data });
    }

    if (historial.length > 0) {
      await Promise.all(historial.map((h) => registrarCambio(id, usuarioId, h.campo, h.antes, h.despues)));
    }
    await registrarAccion("ACTUALIZAR_TAREA", usuarioId, `Tarea ID ${id}`);

    const tareaActualizada = await prisma.tarea.findUnique({
      where: { id },
      include: {
        imagenes:     { orderBy: { orden: "asc" } },
        asignaciones: { include: { usuario: { select: { id: true, nombre: true, username: true, imagen: true } } } },
        creadoPor:    { select: { id: true, nombre: true, username: true } },
        minuta:       { select: { id: true, titulo: true, estado: true } },
        notas:        { orderBy: { createdAt: "desc" } } // <-- SE INCLUYEN AL DEVOLVER
      },
    });

    return res.json({ status: "success", data: tareaActualizada });
  } catch (error) {
    await registrarError("ACTUALIZAR_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al actualizar tarea" });
  }
};