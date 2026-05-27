import {
  Area,
  Departamento,
  EstadoMinuta,
  EstadoTarea,
  Prioridad,
  Prisma,
  Rol,
  TipoEventoEntrada,
  TipoEntrada,
  AlcanceRecordatorio,
} from "@prisma/client";

import { prisma } from "../../db";
import { isValid, parseISO } from "date-fns";
import { evaluateMinutaStatus as evaluateMinutaStatusDomain } from "../minutas/domain/evaluate-minuta-status";

import type { ListTareasQuery } from "./zod";

// ─────────────────────────────────────────────────────────────
// HISTORIAL
// ─────────────────────────────────────────────────────────────

export const registrarCambio = async (
  tareaId: number,
  usuarioId: number,
  campo: string,
  valorAntes: string | null,
  valorDespues: string | null,
  tipo: TipoEventoEntrada = TipoEventoEntrada.ACTUALIZACION
): Promise<void> => {
  await prisma.tareaHistorial.create({
    data: {
      tareaId,
      usuarioId,
      tipo,
      campo,
      valorAntes: valorAntes != null ? String(valorAntes) : null,
      valorDespues: valorDespues != null ? String(valorDespues) : null,
    },
  });
};

// ─────────────────────────────────────────────────────────────
// MINUTAS
// ─────────────────────────────────────────────────────────────

export const evaluarEstadoMinuta = async (minutaId: number, userId?: number): Promise<void> => {
  // Call the new domain service
  // userId might be undefined (e.g. from a cron job), so we pass 0 or a system identifier
  await evaluateMinutaStatusDomain(minutaId, userId || 0);
};

// ─────────────────────────────────────────────────────────────
// WHERE BUILDER
// ─────────────────────────────────────────────────────────────

export const buildTareasWhere = (
  query: ListTareasQuery,
  usuario: {
    id: number;
    rol: Rol;
    departamento?: Departamento | null;
    linea?: string | null;
  }
): Prisma.TareaWhereInput => {
  const where: Prisma.TareaWhereInput = {};
  const and: Prisma.TareaWhereInput[] = [];

  const addEstadoNotInIncludingNull = (estados: EstadoTarea[]) => {
    and.push({
      OR: [
        { estado: { notIn: estados } },
        { estado: null },
      ],
    });
  };

  if (usuario.rol !== Rol.ADMIN && usuario.rol !== Rol.COORDINADOR && usuario.departamento) {
    where.departamento = usuario.departamento;
  } else if (usuario.rol === Rol.ADMIN && (query as any).departamento) {
    where.departamento = (query as any).departamento;
  }

  if (usuario.rol !== Rol.ADMIN && usuario.rol !== Rol.GERENCIA && usuario.rol !== Rol.COORDINADOR && usuario.linea) {
    where.linea = usuario.linea;
  }

  if (query.q) {
    where.descripcion = { contains: query.q };
  }

  if (query.tipo?.length) {
    where.tipo = { in: query.tipo as TipoEntrada[] };
  }

  if (query.estado?.length) {
    where.estado = { in: query.estado as EstadoTarea[] };
  } else if (!query.atrasadas && !(query as any).todo && (!query.tipo || query.tipo.includes("TAREA" as any))) {
    // Por defecto, esconder cerradas o canceladas a menos que pida "todo"
    addEstadoNotInIncludingNull([EstadoTarea.CERRADA, EstadoTarea.CANCELADA]);
  }

  if (query.alcanceRecordatorio?.length) {
      where.alcanceRecordatorio = { in: query.alcanceRecordatorio as AlcanceRecordatorio[] };
  }

  if (query.area?.length) {
    where.area = { in: query.area as Area[] };
  }

  if (query.isExternalArea !== undefined && !query.area?.length) {
    const deptoReferencia = usuario.rol === Rol.ADMIN && (query as any).departamento
      ? (query as any).departamento
      : usuario.departamento;

    if (deptoReferencia) {
      const areaInterna = deptoReferencia === Departamento.MARKETING ? Area.MARKETING : Area.DISENO;
      where.area = query.isExternalArea ? { not: areaInterna } : areaInterna;
    }
  }

  if (query.linea?.length) {
    where.linea = { in: query.linea as string[] };
  }

  if (query.clasificacion?.length) {
    where.clasificacion = { in: query.clasificacion as string[] };
  }

  if (query.prioridad?.length) {
    where.prioridad = { in: query.prioridad as Prioridad[] };
  }

  if (query.minutaId != null) {
    where.minutaId = query.minutaId;
  }

  if (query.creadoPorId != null) {
    where.creadoPorId = query.creadoPorId;
  }
  
  if (query.organizadoPorId != null) {
      where.organizadoPorId = query.organizadoPorId;
  }

  if (query.periodo && query.periodo !== "all") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    if (query.periodo === "week") {
      const day = end.getDay();
      const diff = 6 - day;
      end.setDate(end.getDate() + diff);
    } else if (query.periodo === "month") {
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
    }

    where.fechaVencimiento = {
      gte: start,
      lte: end,
    };
  }

  if (query.atrasadas) {
    where.fechaVencimiento = { lt: new Date() };
    where.tipo = TipoEntrada.TAREA;
    addEstadoNotInIncludingNull([EstadoTarea.CERRADA, EstadoTarea.CANCELADA]);
  }

  if (query.createdDesde || query.createdHasta) {
    where.createdAt = {};
    if (query.createdDesde) where.createdAt.gte = new Date(query.createdDesde);
    if (query.createdHasta) where.createdAt.lte = new Date(query.createdHasta);
  } else if ((query as any).year || (query as any).month) {
    const now = new Date();
    const year = (query as any).year ?? now.getFullYear();

    if ((query as any).month) {
      const month = (query as any).month;
      where.createdAt = {
        gte: new Date(year, month - 1, 1, 0, 0, 0, 0),
        lte: new Date(year, month, 0, 23, 59, 59, 999),
      };
    } else {
      where.createdAt = {
        gte: new Date(year, 0, 1, 0, 0, 0, 0),
        lte: new Date(year, 11, 31, 23, 59, 59, 999),
      };
    }
  }

  if (query.vencimientoDesde || query.vencimientoHasta) {
    where.fechaVencimiento = {};
    if (query.vencimientoDesde) where.fechaVencimiento.gte = new Date(query.vencimientoDesde);
    if (query.vencimientoHasta) where.fechaVencimiento.lte = new Date(query.vencimientoHasta);
  }

  if (query.completadoDesde || query.completadoHasta) {
    where.completadoAt = {};
    if (query.completadoDesde) where.completadoAt.gte = new Date(query.completadoDesde);
    if (query.completadoHasta) where.completadoAt.lte = new Date(query.completadoHasta);
  }

  // Visibilidad base
  if (usuario.rol === Rol.COORDINADOR) {
      and.push({
        OR: [
          {
              asignaciones: { some: { usuarioId: usuario.id } }
          },
          {
              tipo: TipoEntrada.RECORDATORIO,
              alcanceRecordatorio: AlcanceRecordatorio.DEPARTAMENTO,
              departamento: usuario.departamento ?? undefined,
              linea: usuario.linea ?? undefined
          }
        ],
      });
  } else if (query.responsableId != null) {
      where.asignaciones = { some: { usuarioId: query.responsableId } };
  }

  if (and.length > 0) {
    where.AND = and;
  }

  return where;
};

export const normalizarFechaVencimiento = (fecha: Date | string | null | undefined): Date | null => {
  if (!fecha) return null;
  const d = typeof fecha === 'string' ? parseISO(fecha) : new Date(fecha);
  if (!isValid(d)) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
};
