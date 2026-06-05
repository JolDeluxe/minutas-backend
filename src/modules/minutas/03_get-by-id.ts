import type { Request, Response } from "express";
import { prisma } from "../../db";
import { TipoEntrada, EstadoTarea } from "@prisma/client";
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
        notasGenerales: { orderBy: { createdAt: "desc" } },
        tareas: {
          where: {
            ...(usuario.rol !== "ADMIN" && usuario.departamento ? { departamento: usuario.departamento } : {}),
            // Jefes and Gerencia can see all tasks in the department's minuta (no line filter)
            ...(usuario.rol === "COORDINADOR"
              ? {
                  asignaciones: {
                    some: { usuarioId: usuario.id },
                  },
                }
              : {}),
          },
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

    if (usuario.rol !== "ADMIN" && usuario.departamento && minuta.departamento !== usuario.departamento) {
      return res.status(403).json({ error: "No tienes permiso para acceder a esta minuta." });
    }

    const porTipo: Record<string, number> = {};
    const porEstado: Record<string, number> = {};
    const porClasificacion: Record<string, number> = {};
    const porPrioridad: Record<string, number> = {};
    let atrasadas = 0;
    const now = new Date();

    let totalEntradas = minuta.tareas.length;

    if (usuario.rol === "COORDINADOR") {
      const whereBase: any = { minutaId: id };
      if (usuario.departamento) {
        whereBase.departamento = usuario.departamento;
      }
      if (usuario.linea) {
        whereBase.linea = usuario.linea;
      }

      const [tipos, estados, total, clasificaciones, prioridades, countAtrasadas] = await Promise.all([
        prisma.tarea.groupBy({
          by: ["tipo"],
          where: whereBase,
          _count: { id: true },
        }),
        prisma.tarea.groupBy({
          by: ["estado"],
          where: { ...whereBase, estado: { not: null } },
          _count: { id: true },
        }),
        prisma.tarea.count({ where: whereBase }),
        prisma.tarea.groupBy({
          by: ["clasificacion"],
          where: { ...whereBase, clasificacion: { not: null } },
          _count: { id: true },
        }),
        prisma.tarea.groupBy({
          by: ["prioridad"],
          where: { ...whereBase, prioridad: { not: null } },
          _count: { id: true },
        }),
        prisma.tarea.count({
          where: {
            ...whereBase,
            fechaVencimiento: { lt: now },
            OR: [{ estado: { notIn: [EstadoTarea.CERRADA, EstadoTarea.CANCELADA] } }, { estado: null }],
          },
        }),
      ]);

      for (const t of tipos) {
        porTipo[t.tipo] = t._count.id;
      }
      for (const e of estados) {
        if (e.estado) porEstado[e.estado] = e._count.id;
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
      for (const t of minuta.tareas) {
        porTipo[t.tipo] = (porTipo[t.tipo] || 0) + 1;
        if (t.estado) {
          porEstado[t.estado] = (porEstado[t.estado] || 0) + 1;
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
          t.estado !== EstadoTarea.CERRADA &&
          t.estado !== EstadoTarea.CANCELADA
        ) {
          atrasadas++;
        }
      }
    }

    // Adaptar para retrocompatibilidad rápida con frontend mientras actualizan gráficas si es necesario
    const resumen = { porTipo, porEstado, conceptual: porTipo, operativo: porEstado, totalEntradas, atrasadas, porClasificacion, porPrioridad };

    let totalValidas = 0;
    if (usuario.rol === "COORDINADOR") {
      const whereBaseValidas: any = { minutaId: id, tipo: { not: TipoEntrada.DESCARTADA } };
      if (usuario.departamento) {
        whereBaseValidas.departamento = usuario.departamento;
      }
      if (usuario.linea) {
        whereBaseValidas.linea = usuario.linea;
      }
      const countValidas = await prisma.tarea.count({
        where: whereBaseValidas
      });
      totalValidas = countValidas;
    } else {
      for (const t of minuta.tareas) {
        if (t.tipo !== TipoEntrada.DESCARTADA) {
          totalValidas++;
        }
      }
    }
    
    const countActiveOverall = await prisma.tarea.count({
      where: {
        minutaId: id,
        OR: [
          {
            tipo: { in: [TipoEntrada.SIN_ORGANIZAR, TipoEntrada.RECORDATORIO, TipoEntrada.POLITICA] }
          },
          {
            tipo: TipoEntrada.TAREA,
            estado: { notIn: [EstadoTarea.CANCELADA, EstadoTarea.DESCARTADA] }
          }
        ]
      }
    });
    const hasActiveTasks = countActiveOverall > 0;

    const resumenOperativo = { ...resumen, totalValidas, hasActiveTasks };

    let contextoEjecutivo: any[] = [];
    if (minuta.minutaAnteriorId) {
      const whereContexto: any = {
        minutaId: minuta.minutaAnteriorId,
        estado: { in: [EstadoTarea.PENDIENTE, EstadoTarea.EN_REVISION] },
        tipo: { not: TipoEntrada.DESCARTADA }
      };
      if (usuario.rol !== "ADMIN" && usuario.departamento) {
        whereContexto.departamento = usuario.departamento;
      }
      if (usuario.rol !== "ADMIN" && usuario.rol !== "GERENCIA" && usuario.lineas.length > 0) {
        whereContexto.linea = { in: usuario.lineas };
      }

      contextoEjecutivo = await prisma.tarea.findMany({
        where: whereContexto,
        select: {
          id: true,
          descripcion: true,
          estado: true,
          tipo: true,
          asignaciones: {
            include: { usuario: { select: USUARIO_SELECT_BASICO } }
          }
        }
      });
    }

    const ultimasDosJuntas = await prisma.minuta.findMany({
      where: { estado: { in: ["ACTIVA", "CERRADA"] } },
      orderBy: { fechaRealizada: "desc" },
      take: 2,
      select: { id: true },
    });

    const isJuntaActual = ultimasDosJuntas[0]?.id === id;
    const isJuntaAnterior = ultimasDosJuntas[1]?.id === id;

    return res.json({ 
      status: "success", 
      data: { 
        ...minuta, 
        resumenOperativo, 
        contextoEjecutivo,
        isJuntaActual,
        isJuntaAnterior
      } 
    });
  } catch (error) {
    await registrarError("GET_MINUTA_BY_ID", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al obtener minuta" });
  }
};
