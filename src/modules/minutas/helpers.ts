import {
  EstadoConceptual,
  EstadoOperativo,
  EstadoMinuta,
  Prisma,
  Rol,
  Departamento,
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
  query: ListMinutasQuery,
  usuario?: {
    rol: Rol;
    departamento?: Departamento | null;
  }
): Prisma.MinutaWhereInput => {
  const where: Prisma.MinutaWhereInput = {};

  // Aislamiento por departamento si no es ADMIN
  if (usuario && usuario.rol !== Rol.ADMIN && usuario.departamento) {
    where.creadoPor = {
      departamento: usuario.departamento
    };
  }

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
      in: query.lineaDefault as string[],
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
  // PERIODO RÁPIDO (Vista Ejecutiva)
  // ─────────────────────────────

  let fechaRango: { gte?: Date; lte?: Date } | undefined;

  if (query.periodo && query.periodo !== "all") {
    const now = new Date();

    if (query.periodo === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      fechaRango = { gte: start, lte: end };
    } else if (query.periodo === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      fechaRango = { gte: start, lte: end };
    } else if (query.periodo === "month") {
      const y = query.year ?? now.getFullYear();
      const m = query.month ? query.month - 1 : now.getMonth();
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
      fechaRango = { gte: start, lte: end };
    } else if (query.periodo === "year") {
      const y = query.year ?? now.getFullYear();
      const start = new Date(y, 0, 1);
      const end = new Date(y, 11, 31, 23, 59, 59, 999);
      fechaRango = { gte: start, lte: end };
    }
  } else if (query.year || query.month) {
    const now = new Date();
    const y = query.year ?? now.getFullYear();
    if (query.month) {
      const start = new Date(y, query.month - 1, 1);
      const end = new Date(y, query.month, 0, 23, 59, 59, 999);
      fechaRango = { gte: start, lte: end };
    } else {
      const start = new Date(y, 0, 1);
      const end = new Date(y, 11, 31, 23, 59, 59, 999);
      fechaRango = { gte: start, lte: end };
    }
  } else if (query.fechaDesde || query.fechaHasta) {
    fechaRango = {};
    if (query.fechaDesde) {
      fechaRango.gte = new Date(query.fechaDesde);
    }
    if (query.fechaHasta) {
      fechaRango.lte = new Date(query.fechaHasta);
    }
  }

  if (fechaRango) {
    const isOnlyProgramada = query.estado?.length === 1 && query.estado[0] === "PROGRAMADA";
    
    if (isOnlyProgramada) {
      where.fechaProgramada = fechaRango;
    } else if (query.estado?.length && !query.estado.includes("PROGRAMADA" as EstadoMinuta)) {
      where.fechaRealizada = fechaRango;
    } else {
      where.OR = [
        { estado: "PROGRAMADA", fechaProgramada: fechaRango },
        { estado: { not: "PROGRAMADA" }, fechaRealizada: fechaRango }
      ];
    }
  }

  return where;
};