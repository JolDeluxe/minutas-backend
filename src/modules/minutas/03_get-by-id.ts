import type { Request, Response } from "express";
import { prisma } from "../../db";
import { EstadoConceptual, EstadoOperativo } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import { USUARIO_SELECT_BASICO } from "../shared-selects";
import type { MinutaIdParams } from "./zod";

export const getMinutaById = async (req: Request, res: Response) => {
  try {
    const usuario = req.user!;
    const { id } = req.params as unknown as MinutaIdParams;

    const minuta = await prisma.minuta.findUnique({
      where: { id },
      include: {
        creadoPor: { select: USUARIO_SELECT_BASICO },
        cerradoPor: { select: { id: true, nombre: true, username: true } },
        // POST-ITS de la junta
        notasGenerales: { orderBy: { createdAt: "desc" } },
        tareas: {
          // Filtro de visibilidad: COORDINADOR solo ve sus entradas asignadas
          ...(usuario.rol === "COORDINADOR"
            ? {
                where: {
                  asignaciones: {
                    some: { usuarioId: usuario.id },
                  },
                },
              }
            : {}),
          orderBy: { createdAt: "asc" },
          include: {
            imagenes: { orderBy: { orden: "asc" } },
            notas: { orderBy: { createdAt: "desc" } },
            asignaciones: {
              include: {
                usuario: { select: USUARIO_SELECT_BASICO },
              },
            },
            creadoPor: { select: USUARIO_SELECT_BASICO },
          },
        },
      },
    });

    if (!minuta) {
      return res.status(404).json({ error: "Minuta no encontrada" });
    }

    // Calcular resumen inline desde las tareas ya cargadas
    // (evita las 3 queries adicionales de obtenerResumenMinuta)
    const conceptual: Record<string, number> = {};
    const operativo: Record<string, number> = {};
    const porClasificacion: Record<string, number> = {};
    const porPrioridad: Record<string, number> = {};
    let atrasadas = 0;
    const now = new Date();

    // Para el resumen usamos TODAS las tareas (no filtradas por rol)
    // porque el resumen debe reflejar el estado real de la minuta.
    let totalEntradas = minuta.tareas.length;

    if (usuario.rol === "COORDINADOR") {
      // Si es coordinador, necesitamos los conteos reales (no filtrados)
      const [conceptos, operativos, total, clasificaciones, prioridades, countAtrasadas] = await Promise.all([
        prisma.tarea.groupBy({
          by: ["estadoConceptual"],
          where: { minutaId: id },
          _count: { id: true },
        }),
        prisma.tarea.groupBy({
          by: ["estadoOperativo"],
          where: { minutaId: id, estadoOperativo: { not: null } },
          _count: { id: true },
        }),
        prisma.tarea.count({ where: { minutaId: id } }),
        prisma.tarea.groupBy({
          by: ["clasificacion"],
          where: { minutaId: id, clasificacion: { not: null } },
          _count: { id: true },
        }),
        prisma.tarea.groupBy({
          by: ["prioridad"],
          where: { minutaId: id, prioridad: { not: null } },
          _count: { id: true },
        }),
        prisma.tarea.count({
          where: {
            minutaId: id,
            fechaVencimiento: { lt: now },
            estado: { notIn: ["COMPLETADO", "CERRADO"] },
          },
        }),
      ]);

      for (const c of conceptos) {
        conceptual[c.estadoConceptual] = c._count.id;
      }
      for (const o of operativos) {
        operativo[o.estadoOperativo as string] = o._count.id;
      }
      for (const cl of clasificaciones) {
        if (cl.clasificacion) porClasificacion[cl.clasificacion] = cl._count.id;
      }
      for (const p of prioridades) {
        if (p.prioridad) porPrioridad[p.prioridad] = p._count.id;
      }
      totalEntradas = total;
      atrasadas = countAtrasadas;
    } else {
      // Para JEFE/GERENCIA, calcular desde las tareas ya cargadas
      for (const t of minuta.tareas) {
        conceptual[t.estadoConceptual] = (conceptual[t.estadoConceptual] || 0) + 1;
        if (t.estadoOperativo) {
          operativo[t.estadoOperativo] = (operativo[t.estadoOperativo] || 0) + 1;
        }
        if (t.clasificacion) {
          porClasificacion[t.clasificacion] = (porClasificacion[t.clasificacion] || 0) + 1;
        }
        if (t.prioridad) {
          porPrioridad[t.prioridad] = (porPrioridad[t.prioridad] || 0) + 1;
        }
        if (
          t.fechaVencimiento &&
          new Date(t.fechaVencimiento) < now &&
          t.estado !== "COMPLETADO" &&
          t.estado !== "CERRADO"
        ) {
          atrasadas++;
        }
      }
    }

    const resumen = { conceptual, operativo, totalEntradas, atrasadas, porClasificacion, porPrioridad };

    return res.json({ status: "success", data: { ...minuta, resumen } });
  } catch (error) {
    await registrarError("GET_MINUTA_BY_ID", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al obtener minuta" });
  }
};