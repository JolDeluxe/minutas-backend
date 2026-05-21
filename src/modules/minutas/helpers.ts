import {
  EstadoMinuta,
  Prisma,
  Rol,
  Departamento,
} from "@prisma/client";

import { prisma } from "../../db";

import type { ListMinutasQuery } from "./zod";

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
    where.departamento = usuario.departamento;
  } else if (usuario && usuario.rol === Rol.ADMIN && query.departamentoGlobal && query.departamentoGlobal !== "TODAS") {
    // Si es admin y seleccionó un departamento específico
    const mappedDept = query.departamentoGlobal === "DISEÑO" ? Departamento.DISENO : Departamento.MARKETING;
    where.departamento = mappedDept;
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
    const estadosFiltrados: any[] = (query.estado as any[]).filter(
      (e) => e !== "CANCELADA"
    );
    
    // Si se filtra por ACTIVA, también incluimos PROGRAMADA automáticamente
    if (estadosFiltrados.includes("ACTIVA")) {
      if (!estadosFiltrados.includes("PROGRAMADA")) {
        estadosFiltrados.push("PROGRAMADA");
      }
    }

    where.estado = {
      in: estadosFiltrados,
    };
  } else {
    where.estado = {
      notIn: ["CANCELADA"] as EstadoMinuta[],
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
  // PERIODO RÁPIDO Y RANGO DE FECHAS (Vista Ejecutiva)
  // ─────────────────────────────

  let gteLimit: Date | undefined;
  let lteLimit: Date | undefined;

  // 1. Calcular límites por período, año o mes
  if (query.periodo && query.periodo !== "all") {
    const now = new Date();

    if (query.periodo === "today") {
      gteLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      lteLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (query.periodo === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      gteLimit = start;
      lteLimit = end;
    } else if (query.periodo === "month") {
      const y = query.year ?? now.getFullYear();
      const m = query.month ? query.month - 1 : now.getMonth();
      gteLimit = new Date(y, m, 1);
      lteLimit = new Date(y, m + 1, 0, 23, 59, 59, 999);
    } else if (query.periodo === "year") {
      const y = query.year ?? now.getFullYear();
      gteLimit = new Date(y, 0, 1);
      lteLimit = new Date(y, 11, 31, 23, 59, 59, 999);
    }
  } else if (query.year || query.month) {
    const now = new Date();
    const y = query.year ?? now.getFullYear();
    if (query.month) {
      gteLimit = new Date(y, query.month - 1, 1);
      lteLimit = new Date(y, query.month, 0, 23, 59, 59, 999);
    } else {
      gteLimit = new Date(y, 0, 1);
      lteLimit = new Date(y, 11, 31, 23, 59, 59, 999);
    }
  }

  // 2. Intersección con rango personalizado (fechaDesde / fechaHasta)
  if (query.fechaDesde) {
    const fd = new Date(query.fechaDesde);
    if (!gteLimit || fd > gteLimit) {
      gteLimit = fd;
    }
  }
  if (query.fechaHasta) {
    const fh = new Date(query.fechaHasta);
    if (!lteLimit || fh < lteLimit) {
      lteLimit = fh;
    }
  }

  let fechaRango: { gte?: Date; lte?: Date } | undefined;
  if (gteLimit || lteLimit) {
    fechaRango = {};
    if (gteLimit) fechaRango.gte = gteLimit;
    if (lteLimit) fechaRango.lte = lteLimit;
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