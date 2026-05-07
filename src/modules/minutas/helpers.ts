import { EstadoMinuta, Linea, Prisma } from "@prisma/client";
import { prisma } from "../../db";
import type { ListMinutasQuery } from "./zod";

export const obtenerResumenMinuta = async (minutaId: number): Promise<Record<string, number>> => {
  const grupos = await prisma.tarea.groupBy({
    by:     ["estado"],
    where:  { minutaId },
    _count: { id: true },
  });
  return grupos.reduce(
    (acc, curr) => ({ ...acc, [curr.estado]: curr._count.id }),
    {} as Record<string, number>
  );
};

/**
 * Construye dinámicamente la cláusula `where` de Prisma para el listado de minutas.
 * No aplica restricciones de visibilidad adicionales: las minutas son visibles
 * para todos los usuarios autenticados del ecosistema.
 */
export const buildMinutasWhere = (query: ListMinutasQuery): Prisma.MinutaWhereInput => {
  const where: Prisma.MinutaWhereInput = {};

  // Búsqueda de texto en título
  if (query.q) {
    where.titulo = { contains: query.q };
  }

  // Filtros multi-valor con operador IN
  if (query.estado?.length) {
    where.estado = { in: query.estado as EstadoMinuta[] };
  }

  if (query.lineaDefault?.length) {
    where.lineaDefault = { in: query.lineaDefault as Linea[] };
  }

  // Filtro por creador
  if (query.creadoPorId != null) {
    where.creadoPorId = query.creadoPorId;
  }

  // Rango de fecha de la minuta
  if (query.fechaDesde || query.fechaHasta) {
    const f: { gte?: Date; lte?: Date } = {};
    if (query.fechaDesde) f.gte = new Date(query.fechaDesde);
    if (query.fechaHasta) f.lte = new Date(query.fechaHasta);
    where.fecha = f;
  }

  return where;
};