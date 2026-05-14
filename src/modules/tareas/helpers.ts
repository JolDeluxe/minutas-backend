import {
  Area,
  Clasificacion,
  EstadoConceptual,
  EstadoMinuta,
  EstadoOperativo,
  EstadoTarea,
  Linea,
  Prioridad,
  Prisma,
  Rol,
  TipoEventoEntrada,
} from "@prisma/client";

import { prisma } from "../../db";
import { isValid, parseISO } from "date-fns";

import type { ListTareasQuery } from "./zod";

// ─────────────────────────────────────────────────────────────
// FLAGS
// ─────────────────────────────────────────────────────────────

export const calcularIsExternalArea = (
  area: Area | null | undefined
): boolean => {
  if (!area) return false;

  return area !== Area.DISENO;
};

export const calcularCapturaCompleta = (params: {
  clasificacion: Clasificacion | null | undefined;
  fechaVencimiento: Date | null | undefined;
  totalAsignaciones: number;
}): boolean => {
  return (
    params.clasificacion != null &&
    params.fechaVencimiento != null &&
    params.totalAsignaciones > 0
  );
};

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
      valorAntes:
        valorAntes != null
          ? String(valorAntes)
          : null,
      valorDespues:
        valorDespues != null
          ? String(valorDespues)
          : null,
    },
  });
};

// ─────────────────────────────────────────────────────────────
// MINUTAS
// ─────────────────────────────────────────────────────────────

export const evaluarEstadoMinuta = async (
  minutaId: number
): Promise<void> => {
  // Verificar si la minuta fue cerrada manualmente por un usuario.
  // Si fue cerrada manualmente, NO la reabrimos automáticamente.
  const minuta = await prisma.minuta.findUnique({
    where: { id: minutaId },
    select: { estado: true, cerradoPorId: true },
  });

  if (!minuta || minuta.cerradoPorId != null) return;

  const tareas = await prisma.tarea.findMany({
    where: {
      minutaId,
    },

    select: {
      estado: true,
    },
  });

  if (tareas.length === 0) return;

  const todasCerradas = tareas.every(
    (t) => t.estado === EstadoTarea.CERRADO
  );

  await prisma.minuta.update({
    where: {
      id: minutaId,
    },

    data: {
      estado: todasCerradas
        ? EstadoMinuta.CERRADA
        : EstadoMinuta.ACTIVA,
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
    linea?: Linea | null;
  }
): Prisma.TareaWhereInput => {
  const where: Prisma.TareaWhereInput = {};

  // ─────────────────────────────────────────────────────────
  // SEARCH
  // ─────────────────────────────────────────────────────────

  if (query.q) {
    where.descripcion = {
      contains: query.q,
    };
  }

  // ─────────────────────────────────────────────────────────
  // MULTI FILTERS
  // ─────────────────────────────────────────────────────────

  if (query.estado?.length) {
    where.estado = {
      in: query.estado as EstadoTarea[],
    };
  }

  if (query.estadoConceptual?.length) {
    where.estadoConceptual = {
      in:
        query.estadoConceptual as EstadoConceptual[],
    };
  }

  // ── ESTADO OPERATIVO / KILL SWITCH (REFUERZO FINAL) ─────────
  if (query.estadoOperativo) {
    const estados = Array.isArray(query.estadoOperativo) 
      ? query.estadoOperativo 
      : [query.estadoOperativo];

    if (estados.includes('CERRADO' as any)) {
      // Si pedimos CERRADO, ignoramos flujo operativo y vamos directo al estado físico
      where.estado = EstadoTarea.CERRADO;
    } else {
      // Si pedimos cualquier otro, filtramos operativo y bloqueamos CERRADAS
      where.estadoOperativo = { in: estados as EstadoOperativo[] };
      where.estado = { not: EstadoTarea.CERRADO };
    }
  } 
  else if (!query.atrasadas && !query.estado && !(query as any).todo) {
    // Por defecto: Solo activas y que NO estén cerradas
    where.estadoOperativo = { in: [EstadoOperativo.PENDIENTE, EstadoOperativo.EN_PROGRESO] };
    where.estado = { not: EstadoTarea.CERRADO };
  }

  if (query.area?.length) {
    where.area = {
      in: query.area as Area[],
    };
  }

  if (query.linea?.length) {
    where.linea = {
      in: query.linea as Linea[],
    };
  }

  if (query.clasificacion?.length) {
    where.clasificacion = {
      in:
        query.clasificacion as Clasificacion[],
    };
  }

  if (query.prioridad?.length) {
    where.prioridad = {
      in: query.prioridad as Prioridad[],
    };
  }

  // ─────────────────────────────────────────────────────────
  // SCALAR FILTERS
  // ─────────────────────────────────────────────────────────

  if (query.minutaId != null) {
    where.minutaId = query.minutaId;
  }

  if (query.creadoPorId != null) {
    where.creadoPorId = query.creadoPorId;
  }

  if (query.isExternalArea != null) {
    where.isExternalArea =
      query.isExternalArea;
  }

  if (query.capturaCompleta != null) {
    where.capturaCompleta =
      query.capturaCompleta;
  }

  if (query.requiereSeguimiento != null) {
    where.requiereSeguimiento =
      query.requiereSeguimiento;
  }

  if (query.formalizada !== undefined) {
    where.formalizada = query.formalizada;
  }

  // ─────────────────────────────────────────────────────────
  // PERIODO (NUEVO)
  // ─────────────────────────────────────────────────────────
  
  if (query.periodo && query.periodo !== "all") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    if (query.periodo === "today") {
      // Ya está configurado para hoy
    } else if (query.periodo === "week") {
      // Ajustar al domingo de esta semana (fin de semana)
      const day = end.getDay();
      const diff = 6 - day;
      end.setDate(end.getDate() + diff);
    } else if (query.periodo === "month") {
      // Ajustar al último día del mes
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
    }

    where.fechaVencimiento = {
      gte: start,
      lte: end,
    };
  }

  // ─────────────────────────────────────────────────────────
  // ATRASADAS (Solo aplica si no estamos viendo ya terminadas)
  // ─────────────────────────────────────────────────────────

  const estadosActuales = Array.isArray(query.estadoOperativo)
    ? query.estadoOperativo
    : query.estadoOperativo
    ? [query.estadoOperativo]
    : [];

  const viendoTerminadas =
    estadosActuales.includes("COMPLETADO") ||
    estadosActuales.includes("CERRADO");

  if (query.atrasadas && !viendoTerminadas) {
    where.fechaVencimiento = {
      lt: new Date(),
    };
    where.estado = {
      notIn: [EstadoTarea.COMPLETADO, EstadoTarea.CERRADO],
    };
  }

  // ─────────────────────────────────────────────────────────
  // FECHAS
  // ─────────────────────────────────────────────────────────

  if (
    query.createdDesde ||
    query.createdHasta
  ) {
    where.createdAt = {};

    if (query.createdDesde) {
      where.createdAt.gte = new Date(
        query.createdDesde
      );
    }

    if (query.createdHasta) {
      where.createdAt.lte = new Date(
        query.createdHasta
      );
    }
  }

  if (
    query.vencimientoDesde ||
    query.vencimientoHasta
  ) {
    where.fechaVencimiento = {};

    if (query.vencimientoDesde) {
      where.fechaVencimiento.gte = new Date(
        query.vencimientoDesde
      );
    }

    if (query.vencimientoHasta) {
      where.fechaVencimiento.lte = new Date(
        query.vencimientoHasta
      );
    }
  }

  if (
    query.completadoDesde ||
    query.completadoHasta
  ) {
    where.completadoAt = {};

    if (query.completadoDesde) {
      where.completadoAt.gte = new Date(
        query.completadoDesde
      );
    }

    if (query.completadoHasta) {
      where.completadoAt.lte = new Date(
        query.completadoHasta
      );
    }
  }

  if (
    query.seguimientoDesde ||
    query.seguimientoHasta
  ) {
    where.fechaSeguimiento = {};

    if (query.seguimientoDesde) {
      where.fechaSeguimiento.gte =
        new Date(query.seguimientoDesde);
    }

    if (query.seguimientoHasta) {
      where.fechaSeguimiento.lte =
        new Date(query.seguimientoHasta);
    }
  }

  // ─────────────────────────────────────────────────────────
  // VISIBILIDAD
  // ─────────────────────────────────────────────────────────

  if (usuario.rol === Rol.COORDINADOR) {
    /**
     * COORDINADOR
     * Solo puede ver entradas asignadas explícitamente.
     */
    where.asignaciones = {
      some: {
        usuarioId: usuario.id,
      },
    };
  } else if (query.responsableId != null) {
    /**
     * JEFE / GERENCIA
     * Pueden ver TODO el ecosistema.
     * Filtro opcional por responsable específico.
     */
    where.asignaciones = {
      some: {
        usuarioId: query.responsableId,
      },
    };
  }

  return where;
};

/**
 * Normaliza una fecha de vencimiento al último segundo del día (23:59:59 UTC).
 * Acepta strings "YYYY-MM-DD" o ISO completos.
 * Siempre usa UTC para evitar desfases por zona horaria del servidor.
 */
export const normalizarFechaVencimiento = (fecha: Date | string | null | undefined): Date | null => {
  if (!fecha) return null;

  // Convertimos a objeto Date de forma segura
  const d = typeof fecha === 'string' ? parseISO(fecha) : new Date(fecha);
  
  if (!isValid(d)) return null;

  // Normalizamos al final del día (23:59:59) en UTC para evitar desfases
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    23, 59, 59, 999
  ));
};