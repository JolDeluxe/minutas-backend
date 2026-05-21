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

export const evaluarEstadoMinuta = async (minutaId: number): Promise<void> => {
  const minuta = await prisma.minuta.findUnique({
    where: { id: minutaId },
    select: { estado: true, cerradoPorId: true },
  });

  if (!minuta || minuta.cerradoPorId != null) return;

  const tareas = await prisma.tarea.findMany({
    where: { minutaId },
    select: { estado: true },
  });

  if (tareas.length === 0) return;

  const todasCerradasOCanceladas = tareas.every(
    (t) => t.estado === EstadoTarea.CERRADA || t.estado === EstadoTarea.CANCELADA || t.estado === null
  );

  await prisma.minuta.update({
    where: { id: minutaId },
    data: {
      estado: todasCerradasOCanceladas ? EstadoMinuta.CERRADA : EstadoMinuta.ACTIVA,
    },
  });
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

  if (usuario.rol !== Rol.ADMIN && usuario.departamento) {
    where.departamento = usuario.departamento;
  }

  if (usuario.rol !== Rol.ADMIN && usuario.rol !== Rol.GERENCIA && usuario.linea) {
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
    where.estado = { notIn: [EstadoTarea.CERRADA, EstadoTarea.CANCELADA] };
  }

  if (query.alcanceRecordatorio?.length) {
      where.alcanceRecordatorio = { in: query.alcanceRecordatorio as AlcanceRecordatorio[] };
  }

  if (query.area?.length) {
    where.area = { in: query.area as Area[] };
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
    where.estado = { notIn: [EstadoTarea.CERRADA, EstadoTarea.CANCELADA] };
  }

  if (query.createdDesde || query.createdHasta) {
    where.createdAt = {};
    if (query.createdDesde) where.createdAt.gte = new Date(query.createdDesde);
    if (query.createdHasta) where.createdAt.lte = new Date(query.createdHasta);
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
      where.OR = [
          {
              asignaciones: { some: { usuarioId: usuario.id } }
          },
          {
              tipo: TipoEntrada.RECORDATORIO,
              alcanceRecordatorio: AlcanceRecordatorio.DEPARTAMENTO
          }
      ];
  } else if (query.responsableId != null) {
      where.asignaciones = { some: { usuarioId: query.responsableId } };
  }

  return where;
};

export const normalizarFechaVencimiento = (fecha: Date | string | null | undefined): Date | null => {
  if (!fecha) return null;
  const d = typeof fecha === 'string' ? parseISO(fecha) : new Date(fecha);
  if (!isValid(d)) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
};