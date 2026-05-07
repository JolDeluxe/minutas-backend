import {
  Area,
  type Clasificacion,
  type EstadoTarea,
  type Linea,
  type Prisma,
  type PrismaClient,
  type Prioridad,
  type Tarea,
} from "@prisma/client";
import type { DashboardFiltrosQuery } from "./zod";

const TZ = "America/Mexico_City";

type TareaConMinuta = Pick<
  Tarea,
  | "id"
  | "estado"
  | "descripcion"
  | "createdAt"
  | "completadoAt"
  | "fechaVencimiento"
  | "minutaId"
> & {
  minuta: { id: number; titulo: string; fecha: Date } | null;
};

export type TareaEvaluada = TareaConMinuta & {
  metrica: {
    entregada: boolean;
    evaluable: boolean;
    cumplio: boolean | null;
    score: 0 | 100 | null;
    fechaEntregaDia: string | null;
    fechaVencimientoDia: string | null;
  };
};

type MetricasAgregadas = {
  totalTareas: number;
  totalEntregadas: number;
  totalPendientesEntrega: number;
  totalEvaluables: number;
  totalSinVencimiento: number;
  totalCumplen: number;
  totalNoCumplen: number;
  kpiCumplimiento: number | null;
  porcentajeCumplimiento: number | null;
};

export type DashboardMetricasData = {
  filtrosAplicados: DashboardFiltrosQuery;
  periodo: {
    campoFecha: "createdAt" | "fechaVencimiento" | "completadoAt";
    fechaInicio: string | null;
    fechaFin: string | null;
  };
  aniosDisponibles: number[];
  resumenGeneral: MetricasAgregadas;
  porMinuta: Array<
    MetricasAgregadas & {
      minutaId: number | null;
      minutaTitulo: string;
      minutaFecha: string | null;
    }
  >;
  porFecha: Array<
    MetricasAgregadas & {
      fecha: string;
    }
  >;
};

const toSafePercent = (value: number, total: number): number | null =>
  total > 0 ? Number(((value / total) * 100).toFixed(2)) : null;

const getMxDateParts = (date: Date): { day: string; month: string; year: string } => {
  const parts = new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);

  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  return { day, month, year };
};

const toMXComparableDate = (date: Date): number => {
  const { day, month, year } = getMxDateParts(date);
  return Number(`${year}${month}${day}`);
};

const toMXDayKey = (date: Date): string => {
  const { day, month, year } = getMxDateParts(date);
  return `${year}-${month}-${day}`;
};

const isValidDate = (value: Date): boolean => !Number.isNaN(value.getTime());

const toIsoDateTime = (date: Date): string => date.toISOString();

const parseIsoDate = (value: string | Date): Date | null => {
  const result = new Date(value);
  return isValidDate(result) ? result : null;
};

export const resolverRangoFechas = (
  rango?: string,
  year?: number,
  month?: number,
  fechaInicio?: string | Date,
  fechaFin?: string | Date
): { fechaInicio: Date | null; fechaFin: Date | null } => {
  
  if (rango && rango !== "personalizado") {
    const inicio = new Date();
    const fin = new Date();
    
    switch (rango) {
      case "hoy":
        inicio.setHours(0, 0, 0, 0);
        fin.setHours(23, 59, 59, 999);
        break;
      case "ayer":
        inicio.setDate(inicio.getDate() - 1);
        inicio.setHours(0, 0, 0, 0);
        fin.setDate(fin.getDate() - 1);
        fin.setHours(23, 59, 59, 999);
        break;
      case "esta_semana":
        const diaSemana = inicio.getDay() || 7; // Lunes = 1, Domingo = 7
        inicio.setDate(inicio.getDate() - diaSemana + 1);
        inicio.setHours(0, 0, 0, 0);
        fin.setDate(inicio.getDate() + 6);
        fin.setHours(23, 59, 59, 999);
        break;
      case "semana_pasada":
        const diaSemanaPasada = inicio.getDay() || 7;
        inicio.setDate(inicio.getDate() - diaSemanaPasada - 6);
        inicio.setHours(0, 0, 0, 0);
        fin.setDate(inicio.getDate() + 6);
        fin.setHours(23, 59, 59, 999);
        break;
      case "este_mes":
        inicio.setDate(1);
        inicio.setHours(0, 0, 0, 0);
        fin.setMonth(fin.getMonth() + 1, 0);
        fin.setHours(23, 59, 59, 999);
        break;
      case "mes_pasado":
        inicio.setMonth(inicio.getMonth() - 1, 1);
        inicio.setHours(0, 0, 0, 0);
        fin.setDate(0); 
        fin.setHours(23, 59, 59, 999);
        break;
      case "este_anio":
        inicio.setMonth(0, 1);
        inicio.setHours(0, 0, 0, 0);
        fin.setMonth(11, 31);
        fin.setHours(23, 59, 59, 999);
        break;
    }
    return { fechaInicio: inicio, fechaFin: fin };
  }

  if (fechaInicio || fechaFin) {
    const inicio = fechaInicio ? parseIsoDate(fechaInicio) : null;
    const fin = fechaFin ? parseIsoDate(fechaFin) : null;
    return { fechaInicio: inicio, fechaFin: fin };
  }

  if (!year) return { fechaInicio: null, fechaFin: null };

  if (!month || month === 0) {
    return {
      fechaInicio: new Date(year, 0, 1, 0, 0, 0, 0),
      fechaFin: new Date(year, 11, 31, 23, 59, 59, 999),
    };
  }

  const lastDay = new Date(year, month, 0).getDate();
  return {
    fechaInicio: new Date(year, month - 1, 1, 0, 0, 0, 0),
    fechaFin: new Date(year, month - 1, lastDay, 23, 59, 59, 999),
  };
};

export const buildDashboardWhere = (query: DashboardFiltrosQuery): Prisma.TareaWhereInput => {
  const where: Prisma.TareaWhereInput = { area: Area.DISENO };

  if (query.q) where.descripcion = { contains: query.q };
  if (query.minutaId != null) where.minutaId = query.minutaId;
  if (query.creadoPorId != null) where.creadoPorId = query.creadoPorId;
  if (query.estado?.length) where.estado = { in: query.estado as EstadoTarea[] };
  if (query.linea?.length) where.linea = { in: query.linea as Linea[] };
  if (query.clasificacion?.length) {
    where.clasificacion = { in: query.clasificacion as Clasificacion[] };
  }
  if (query.prioridad?.length) where.prioridad = { in: query.prioridad as Prioridad[] };
  if (query.capturaCompleta != null) where.capturaCompleta = query.capturaCompleta;
  if (query.responsableId != null) {
    where.asignaciones = { some: { usuarioId: query.responsableId } };
  }

  const { fechaInicio, fechaFin } = resolverRangoFechas(
    query.rango,
    query.year,
    query.month,
    query.fechaInicio,
    query.fechaFin
  );

  if (fechaInicio || fechaFin) {
    const filter: { gte?: Date; lte?: Date } = {};
    if (fechaInicio) filter.gte = fechaInicio;
    if (fechaFin) filter.lte = fechaFin;

    if (query.campoFecha === "createdAt") where.createdAt = filter;
    if (query.campoFecha === "fechaVencimiento") where.fechaVencimiento = filter;
    if (query.campoFecha === "completadoAt") where.completadoAt = filter;
  }

  return where;
};

export const evaluarCumplimiento = (tarea: TareaConMinuta): TareaEvaluada["metrica"] => {
  const entregada = tarea.completadoAt != null;
  const evaluable = entregada && tarea.fechaVencimiento != null;

  if (!evaluable) {
    return {
      entregada,
      evaluable: false,
      cumplio: null,
      score: null,
      fechaEntregaDia: tarea.completadoAt ? toMXDayKey(tarea.completadoAt) : null,
      fechaVencimientoDia: tarea.fechaVencimiento ? toMXDayKey(tarea.fechaVencimiento) : null,
    };
  }

  const fechaEntrega = tarea.completadoAt as Date;
  const fechaVencimiento = tarea.fechaVencimiento as Date;
  const fechaEntregaDia = toMXDayKey(fechaEntrega);
  const fechaVencimientoDia = toMXDayKey(fechaVencimiento);
  const cumplio = toMXComparableDate(fechaEntrega) <= toMXComparableDate(fechaVencimiento);

  return {
    entregada,
    evaluable: true,
    cumplio,
    score: cumplio ? 100 : 0,
    fechaEntregaDia,
    fechaVencimientoDia,
  };
};

const construirAgregado = (tareas: TareaEvaluada[]): MetricasAgregadas => {
  const totalTareas = tareas.length;
  const totalEntregadas = tareas.filter((t) => t.metrica.entregada).length;
  const totalPendientesEntrega = totalTareas - totalEntregadas;
  const totalEvaluables = tareas.filter((t) => t.metrica.evaluable).length;
  const totalSinVencimiento = tareas.filter(
    (t) => t.metrica.entregada && !t.metrica.evaluable
  ).length;
  const totalCumplen = tareas.filter((t) => t.metrica.cumplio === true).length;
  const totalNoCumplen = tareas.filter((t) => t.metrica.cumplio === false).length;
  const porcentajeCumplimiento = toSafePercent(totalCumplen, totalEvaluables);

  return {
    totalTareas,
    totalEntregadas,
    totalPendientesEntrega,
    totalEvaluables,
    totalSinVencimiento,
    totalCumplen,
    totalNoCumplen,
    porcentajeCumplimiento,
    kpiCumplimiento: porcentajeCumplimiento,
  };
};

export const aplicarPostFiltros = (
  tareas: TareaEvaluada[],
  query: DashboardFiltrosQuery
): TareaEvaluada[] => {
  return tareas.filter((t) => {
    if (query.soloEntregadas === true && !t.metrica.entregada) return false;
    if (query.soloEntregadas === false && t.metrica.entregada) return false;

    if (query.soloEvaluables === true && !t.metrica.evaluable) return false;
    if (query.soloEvaluables === false && t.metrica.evaluable) return false;

    if (query.cumplio === true && t.metrica.cumplio !== true) return false;
    if (query.cumplio === false && t.metrica.cumplio !== false) return false;

    return true;
  });
};

const agruparPorMinuta = (
  tareas: TareaEvaluada[]
): DashboardMetricasData["porMinuta"] => {
  const map = new Map<number | null, TareaEvaluada[]>();

  for (const tarea of tareas) {
    const key = tarea.minutaId ?? null;
    const current = map.get(key) ?? [];
    current.push(tarea);
    map.set(key, current);
  }

  return Array.from(map.entries())
    .map(([minutaId, items]) => {
      const muestra = items[0] ?? null;
      const minutaTitulo = muestra?.minuta?.titulo ?? "SIN_MINUTA";
      const minutaFecha = muestra?.minuta?.fecha
        ? toIsoDateTime(muestra.minuta.fecha)
        : null;

      return {
        minutaId,
        minutaTitulo,
        minutaFecha,
        ...construirAgregado(items),
      };
    })
    .sort((a, b) => {
      if (a.minutaId === null && b.minutaId !== null) return 1;
      if (a.minutaId !== null && b.minutaId === null) return -1;
      return b.totalTareas - a.totalTareas;
    });
};

const agruparPorFecha = (tareas: TareaEvaluada[]): DashboardMetricasData["porFecha"] => {
  const map = new Map<string, TareaEvaluada[]>();

  for (const tarea of tareas) {
    if (!tarea.metrica.fechaEntregaDia) continue;
    const key = tarea.metrica.fechaEntregaDia;
    const current = map.get(key) ?? [];
    current.push(tarea);
    map.set(key, current);
  }

  return Array.from(map.entries())
    .map(([fechaDia, items]) => ({
      fecha: `${fechaDia}T00:00:00.000Z`,
      ...construirAgregado(items),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
};

type PrismaForDashboard = Pick<PrismaClient, "tarea">;

const buildAvailableYears = async (prisma: PrismaForDashboard) => {
  const bounds = await prisma.tarea.aggregate({
    where: { area: Area.DISENO },
    _min: { createdAt: true },
    _max: { createdAt: true },
  });

  const minYear = bounds._min.createdAt?.getFullYear();
  const maxYear = bounds._max.createdAt?.getFullYear();
  if (!minYear || !maxYear) return [];

  const years: number[] = [];
  for (let year = maxYear; year >= minYear; year--) years.push(year);
  return years;
};

export const construirDashboardMetricas = async (
  prisma: PrismaForDashboard,
  query: DashboardFiltrosQuery
): Promise<DashboardMetricasData> => {
  const where = buildDashboardWhere(query);

  const [tareasRaw, aniosDisponibles] = await Promise.all([
    prisma.tarea.findMany({
      where,
      select: {
        id: true,
        estado: true,
        descripcion: true,
        createdAt: true,
        completadoAt: true,
        fechaVencimiento: true,
        minutaId: true,
        minuta: {
          select: {
            id: true,
            titulo: true,
            fecha: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    buildAvailableYears(prisma),
  ]);

  const tareasEvaluadas = tareasRaw.map((tarea) => ({
    ...tarea,
    metrica: evaluarCumplimiento(tarea),
  }));

  const tareasFiltradas = aplicarPostFiltros(tareasEvaluadas, query);

  const { fechaInicio, fechaFin } = resolverRangoFechas(
    query.rango,
    query.year,
    query.month,
    query.fechaInicio,
    query.fechaFin
  );

  return {
    filtrosAplicados: query,
    periodo: {
      campoFecha: query.campoFecha,
      fechaInicio: fechaInicio ? toIsoDateTime(fechaInicio) : null,
      fechaFin: fechaFin ? toIsoDateTime(fechaFin) : null,
    },
    aniosDisponibles,
    resumenGeneral: construirAgregado(tareasFiltradas),
    porMinuta: agruparPorMinuta(tareasFiltradas),
    porFecha: agruparPorFecha(tareasFiltradas),
  };
};