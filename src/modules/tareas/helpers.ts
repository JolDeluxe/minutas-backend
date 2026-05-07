import { Area, EstadoTarea, EstadoMinuta, Rol, Linea, Clasificacion, Prioridad, Prisma } from "@prisma/client";
import { prisma } from "../../db";
import type { ListTareasQuery } from "./zod";

export const calcularIsExternalArea = (area: Area | null | undefined): boolean => {
  if (!area) return false;
  return area !== Area.DISENO;
};

export const calcularCapturaCompleta = (params: {
  clasificacion:     string | null | undefined;
  fechaVencimiento:  Date   | null | undefined;
  totalAsignaciones: number;
}): boolean => {
  return (
    params.clasificacion    != null &&
    params.fechaVencimiento != null &&
    params.totalAsignaciones > 0
  );
};

export const registrarCambio = async (
  tareaId:      number,
  usuarioId:    number,
  campo:        string,
  valorAntes:   string | null,
  valorDespues: string | null
): Promise<void> => {
  await prisma.tareaHistorial.create({
    data: {
      tareaId,
      usuarioId,
      campo,
      valorAntes:   valorAntes   ? String(valorAntes)   : null,
      valorDespues: valorDespues ? String(valorDespues) : null,
    },
  });
};

export const evaluarEstadoMinuta = async (minutaId: number): Promise<void> => {
  const tareas = await prisma.tarea.findMany({
    where:  { minutaId },
    select: { estado: true },
  });
  if (tareas.length === 0) return;
  const todasCerradas = tareas.every((t) => t.estado === EstadoTarea.CERRADO);
  await prisma.minuta.update({
    where: { id: minutaId },
    data:  { estado: todasCerradas ? EstadoMinuta.CERRADA : EstadoMinuta.ACTIVA },
  });
};

/**
 * Construye dinámicamente la cláusula `where` de Prisma para el listado de tareas.
 * Aplica las reglas de visibilidad por rol directamente, garantizando que ningún
 * controlador necesite lógica de filtrado manual.
 */
export const buildTareasWhere = (
  query: ListTareasQuery,
  usuario: { id: number; rol: Rol; linea?: Linea | null }
): Prisma.TareaWhereInput => {
  const where: Prisma.TareaWhereInput = {};

  // Búsqueda de texto
  if (query.q) {
    where.descripcion = { contains: query.q };
  }

  // Filtros multi-valor con operador IN
  if (query.estado?.length)        where.estado        = { in: query.estado        as EstadoTarea[]   };
  if (query.area?.length)          where.area          = { in: query.area          as Area[]           };
  if (query.linea?.length)         where.linea         = { in: query.linea         as Linea[]          };
  if (query.clasificacion?.length) where.clasificacion = { in: query.clasificacion as Clasificacion[]  };
  if (query.prioridad?.length)     where.prioridad     = { in: query.prioridad     as Prioridad[]      };

  // Filtros escalares
  if (query.minutaId    != null) where.minutaId    = query.minutaId;
  if (query.creadoPorId != null) where.creadoPorId = query.creadoPorId;
  if (query.isExternalArea  != null) where.isExternalArea  = query.isExternalArea;
  if (query.capturaCompleta != null) where.capturaCompleta = query.capturaCompleta;

  // Rango: fecha de creación
  if (query.createdDesde || query.createdHasta) {
    const f: { gte?: Date; lte?: Date } = {};
    if (query.createdDesde) f.gte = new Date(query.createdDesde);
    if (query.createdHasta) f.lte = new Date(query.createdHasta);
    where.createdAt = f;
  }

  // Rango: fecha de vencimiento
  if (query.vencimientoDesde || query.vencimientoHasta) {
    const f: { gte?: Date; lte?: Date } = {};
    if (query.vencimientoDesde) f.gte = new Date(query.vencimientoDesde);
    if (query.vencimientoHasta) f.lte = new Date(query.vencimientoHasta);
    where.fechaVencimiento = f;
  }

  // Rango: fecha de completado (métrica de cumplimiento)
  if (query.completadoDesde || query.completadoHasta) {
    const f: { gte?: Date; lte?: Date } = {};
    if (query.completadoDesde) f.gte = new Date(query.completadoDesde);
    if (query.completadoHasta) f.lte = new Date(query.completadoHasta);
    where.completadoAt = f;
  }

  // ── Reglas de Visibilidad por Rol ───────────────────────────────────────────
  // COORDINADOR: visibilidad estricta → solo sus asignaciones explícitas.
  // JEFE/GERENCIA: si se proporciona responsableId, filtra por ese usuario.
  //   Si no, sin restricción adicional (ven todo el ecosistema).
  if (usuario.rol === Rol.COORDINADOR) {
    where.asignaciones = { some: { usuarioId: usuario.id } };
  } else if (query.responsableId != null) {
    where.asignaciones = { some: { usuarioId: query.responsableId } };
  }

  return where;
};