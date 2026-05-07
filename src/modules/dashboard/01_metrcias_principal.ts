import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import type { DashboardFiltrosQuery } from "./zod";
import { construirDashboardMetricas } from "./helper_metrics";

const buildPrincipalData = async (filtros: DashboardFiltrosQuery) => {
  const dashboard = await construirDashboardMetricas(prisma, filtros);
  return {
    periodo: dashboard.periodo,
    resumen: dashboard.resumenGeneral,
    topMinutas: dashboard.porMinuta.slice(0, 5),
    evolucionFechas: dashboard.porFecha,
  };
};

export const getDashboardMetricas = async (req: Request, res: Response) => {
  try {
    const filtros = req.query as unknown as DashboardFiltrosQuery;
    const data = await construirDashboardMetricas(prisma, filtros);
    return res.json({ status: "success", data });
  } catch (error) {
    await registrarError("DASHBOARD_METRICAS", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al calcular métricas del dashboard" });
  }
};

export const getKpisGeneral = async (req: Request, res: Response) => {
  try {
    const filtros = req.query as unknown as DashboardFiltrosQuery;
    const dashboard = await construirDashboardMetricas(prisma, filtros);
    return res.json({
      status: "success",
      data: {
        filtrosAplicados: dashboard.filtrosAplicados,
        periodo: dashboard.periodo,
        aniosDisponibles: dashboard.aniosDisponibles,
        resumen: dashboard.resumenGeneral,
      },
    });
  } catch (error) {
    await registrarError("DASHBOARD_KPIS_GENERAL", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al calcular métricas generales" });
  }
};

export const getKpisArea = async (req: Request, res: Response) => {
  try {
    const filtros = req.query as unknown as DashboardFiltrosQuery;
    const dashboard = await construirDashboardMetricas(prisma, filtros);
    return res.json({
      status: "success",
      data: {
        filtrosAplicados: dashboard.filtrosAplicados,
        periodo: dashboard.periodo,
        aniosDisponibles: dashboard.aniosDisponibles,
        metricasPorMinuta: dashboard.porMinuta,
      },
    });
  } catch (error) {
    await registrarError("DASHBOARD_KPIS_MINUTA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al calcular métricas por minuta" });
  }
};

export const getKpisEquipo = async (req: Request, res: Response) => {
  try {
    const filtros = req.query as unknown as DashboardFiltrosQuery;
    const dashboard = await construirDashboardMetricas(prisma, filtros);
    return res.json({
      status: "success",
      data: {
        filtrosAplicados: dashboard.filtrosAplicados,
        periodo: dashboard.periodo,
        aniosDisponibles: dashboard.aniosDisponibles,
        metricasPorFecha: dashboard.porFecha,
      },
    });
  } catch (error) {
    await registrarError("DASHBOARD_KPIS_FECHA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al calcular métricas por fecha" });
  }
};

export const getKpiPrincipal = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const entrada = req.query as unknown as Partial<DashboardFiltrosQuery>;

    const filtros: DashboardFiltrosQuery = {
      q: entrada.q,
      year: entrada.year ?? now.getFullYear(),
      month: entrada.month ?? now.getMonth() + 1,
      fechaInicio: entrada.fechaInicio,
      fechaFin: entrada.fechaFin,
      campoFecha: entrada.campoFecha ?? "completadoAt",
      minutaId: entrada.minutaId,
      creadoPorId: entrada.creadoPorId,
      responsableId: entrada.responsableId,
      estado: entrada.estado,
      linea: entrada.linea,
      clasificacion: entrada.clasificacion,
      prioridad: entrada.prioridad,
      capturaCompleta: entrada.capturaCompleta,
      soloEntregadas: entrada.soloEntregadas,
      soloEvaluables: entrada.soloEvaluables,
      cumplio: entrada.cumplio,
    };

    const data = await buildPrincipalData(filtros);
    return res.json({ status: "success", data });
  } catch (error) {
    await registrarError("DASHBOARD_PRINCIPAL", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al calcular dashboard principal" });
  }
};
