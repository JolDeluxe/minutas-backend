import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { dashboardFiltrosSchema } from "../modules/dashboard/zod";
import {
  getDashboardMetricas,
  getKpisArea,
  getKpisEquipo,
  getKpisGeneral,
  getKpiPrincipal,
} from "../modules/dashboard/01_metrcias_principal";

const router = Router();
router.use(authenticate);

// Endpoint consolidado: general + por minuta + por fecha
router.get("/", validate(dashboardFiltrosSchema), getDashboardMetricas);

// Vista principal del periodo actual (o del filtro recibido)
router.get(
  "/kpis/principal",
  validate(dashboardFiltrosSchema),
  getKpiPrincipal
);

// Métrica general
router.get(
  "/kpis/general",
  validate(dashboardFiltrosSchema),
  getKpisGeneral
);

// Métricas por minuta
router.get(
  "/kpis/minuta",
  validate(dashboardFiltrosSchema),
  getKpisArea
);

// Alias de compatibilidad
router.get("/kpis/area", validate(dashboardFiltrosSchema), getKpisArea);

// Métricas por fecha
router.get(
  "/kpis/fechas",
  validate(dashboardFiltrosSchema),
  getKpisEquipo
);

// Alias de compatibilidad
router.get("/kpis/equipo", validate(dashboardFiltrosSchema), getKpisEquipo);

export default router;
