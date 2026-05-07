import { z } from "zod";
import { Clasificacion, EstadoTarea, Linea, Prioridad } from "@prisma/client";

const pre = (val: unknown): unknown =>
  val === "" || val === "null" || val === "undefined" ? undefined : val;

const parseCsv = (val: unknown): unknown => {
  if (typeof val === "string" && val.trim() !== "") {
    return val
      .split(",")
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean);
  }
  if (Array.isArray(val)) return val;
  return undefined;
};

const parseBoolean = (val: unknown): boolean | undefined => {
  if (val === true || val === "true") return true;
  if (val === false || val === "false") return false;
  return undefined;
};

const isoFecha = z.coerce.date({ 
  message: "Fecha inválida" 
}).optional();

const estadoValues = Object.values(EstadoTarea) as [string, ...string[]];
const lineaValues = Object.values(Linea) as [string, ...string[]];
const clasificacionValues = Object.values(Clasificacion) as [string, ...string[]];
const prioridadValues = Object.values(Prioridad) as [string, ...string[]];

const rangosPermitidos = [
  "hoy",
  "ayer",
  "esta_semana",
  "semana_pasada",
  "este_mes",
  "mes_pasado",
  "este_anio",
  "personalizado"
] as const;

export const dashboardFiltrosSchema = z.object({
  query: z
    .object({
      q: z.preprocess(pre, z.string().optional()),
      rango: z.preprocess(pre, z.enum(rangosPermitidos).optional()),
      year: z.preprocess(pre, z.coerce.number().int().min(2020).max(2100).optional()),
      month: z.preprocess(pre, z.coerce.number().int().min(0).max(12).optional()),
      fechaInicio: isoFecha,
      fechaFin: isoFecha,
      campoFecha: z.preprocess(
        pre,
        z.enum(["createdAt", "fechaVencimiento", "completadoAt"]).default("completadoAt")
      ),
      minutaId: z.preprocess(pre, z.coerce.number().int().positive().optional()),
      creadoPorId: z.preprocess(pre, z.coerce.number().int().positive().optional()),
      responsableId: z.preprocess(pre, z.coerce.number().int().positive().optional()),
      estado: z.preprocess(parseCsv, z.array(z.enum(estadoValues)).optional()),
      linea: z.preprocess(parseCsv, z.array(z.enum(lineaValues)).optional()),
      clasificacion: z.preprocess(parseCsv, z.array(z.enum(clasificacionValues)).optional()),
      prioridad: z.preprocess(parseCsv, z.array(z.enum(prioridadValues)).optional()),
      capturaCompleta: z.preprocess(parseBoolean, z.boolean().optional()),
      soloEntregadas: z.preprocess(parseBoolean, z.boolean().optional()),
      soloEvaluables: z.preprocess(parseBoolean, z.boolean().optional()),
      cumplio: z.preprocess(parseBoolean, z.boolean().optional()),
    })
    .strict(),
});

export type DashboardFiltrosQuery = z.infer<typeof dashboardFiltrosSchema>["query"];