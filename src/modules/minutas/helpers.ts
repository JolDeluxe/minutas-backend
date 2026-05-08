import {
  EstadoConceptual,
  EstadoOperativo,
  EstadoMinuta,
  Linea,
  Prisma,
} from "@prisma/client";

import { prisma } from "../../db";

import type { ListMinutasQuery } from "./zod";

export const obtenerResumenMinuta = async (
  minutaId: number
): Promise<{
  conceptual: Record<string, number>;
  operativo: Record<string, number>;
  totalEntradas: number;
}> => {
  const [
    conceptos,
    operativos,
    totalEntradas,
  ] = await Promise.all([
    prisma.tarea.groupBy({
      by: ["estadoConceptual"],

      where: {
        minutaId,
      },

      _count: {
        id: true,
      },
    }),

    prisma.tarea.groupBy({
      by: ["estadoOperativo"],

      where: {
        minutaId,
        estadoOperativo: {
          not: null,
        },
      },

      _count: {
        id: true,
      },
    }),

    prisma.tarea.count({
      where: {
        minutaId,
      },
    }),
  ]);

  const conceptual =
    conceptos.reduce(
      (acc, curr) => ({
        ...acc,
        [curr.estadoConceptual]:
          curr._count.id,
      }),

      {} as Record<string, number>
    );

  const operativo =
    operativos.reduce(
      (acc, curr) => ({
        ...acc,
        [curr.estadoOperativo as EstadoOperativo]:
          curr._count.id,
      }),

      {} as Record<string, number>
    );

  return {
    conceptual,
    operativo,
    totalEntradas,
  };
};

/**
 * Construye dinámicamente la cláusula `where`
 * para el listado de minutas.
 */
export const buildMinutasWhere = (
  query: ListMinutasQuery
): Prisma.MinutaWhereInput => {
  const where: Prisma.MinutaWhereInput = {};

  // ─────────────────────────────
  // Búsqueda textual
  // ─────────────────────────────

  if (query.q) {
    where.titulo = {
      contains: query.q,
    };
  }

  // ─────────────────────────────
  // Filtros multi-valor
  // ─────────────────────────────

  if (query.estado?.length) {
    where.estado = {
      in: query.estado as EstadoMinuta[],
    };
  }

  if (query.lineaDefault?.length) {
    where.lineaDefault = {
      in: query.lineaDefault as Linea[],
    };
  }

  // ─────────────────────────────
  // Filtro por creador
  // ─────────────────────────────

  if (query.creadoPorId != null) {
    where.creadoPorId =
      query.creadoPorId;
  }

  // ─────────────────────────────
  // Rangos de fecha
  // ─────────────────────────────

  if (
    query.fechaDesde ||
    query.fechaHasta
  ) {
    const rango: {
      gte?: Date;
      lte?: Date;
    } = {};

    if (query.fechaDesde) {
      rango.gte =
        new Date(query.fechaDesde);
    }

    if (query.fechaHasta) {
      rango.lte =
        new Date(query.fechaHasta);
    }

    where.fecha = rango;
  }

  return where;
};