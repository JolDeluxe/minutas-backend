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

  if (query.estadoOperativo?.length) {
    where.estadoOperativo = {
      in:
        query.estadoOperativo as EstadoOperativo[],
    };
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

  if (query.formalizada != null) {
    where.formalizada = query.formalizada;
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