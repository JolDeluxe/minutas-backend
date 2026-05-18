import { z } from "zod";
import { Linea, EstadoMinuta } from "@prisma/client";

const lineaValues  = Object.values(Linea)        as [string, ...string[]];
const estadoValues = Object.values(EstadoMinuta) as [string, ...string[]];

const pre = (val: unknown): unknown =>
  val === "" || val === "null" || val === "undefined" ? undefined : val;

const parseCsv = (val: unknown): unknown => {
  if (typeof val === "string" && val.trim() !== "")
    return val.split(",").map((v) => v.trim()).filter(Boolean);
  if (Array.isArray(val)) return val;
  return undefined;
};

const isoFecha = z.coerce.date({ 
  message: "Fecha inválida" 
}).optional();

export const createMinutaSchema = z.object({
  body: z.object({
    titulo:       z.string().min(3, "El título debe tener al menos 3 caracteres").max(200),
    lineaDefault: z.enum(lineaValues, { message: "Línea inválida" }),
  }),
});

export const listMinutasSchema = z.object({
  query: z.object({
    // Búsqueda de texto en título
    q: z.string().optional(),

    // Filtros multi-valor vía CSV
    estado:       z.preprocess(parseCsv, z.array(z.enum(estadoValues)).optional()),
    lineaDefault: z.preprocess(parseCsv, z.array(z.enum(lineaValues)).optional()),

    // Filtro por creador
    creadoPorId: z.preprocess(pre, z.coerce.number().int().positive().optional()),

    // Rangos de fecha de la minuta (ISO 8601 UTC estricto)
    fechaDesde: isoFecha,
    fechaHasta: isoFecha,

    // ─── FILTROS RÁPIDOS DE PERIODO (Vista Ejecutiva) ───
    periodo: z.preprocess(pre, z.enum(["today", "week", "month", "year", "all"]).optional()),
    year:    z.preprocess(pre, z.coerce.number().int().min(2020).max(2100).optional()),
    month:   z.preprocess(pre, z.coerce.number().int().min(1).max(12).optional()),

    // Paginación
    page:  z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),

    // Ordenamiento
    sort: z.preprocess(
      (val) => {
        if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
        return val ?? [];
      },
      z
        .array(
          z
            .object({
              fecha:     z.enum(["asc", "desc"]).optional(),
              titulo:    z.enum(["asc", "desc"]).optional(),
              createdAt: z.enum(["asc", "desc"]).optional(),
            })
            .strict()
        )
        .default([{ fecha: "desc" }])
    ),
  }),
});

export const minutaIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

export type CreateMinutaInput = z.infer<typeof createMinutaSchema>["body"];
export type ListMinutasQuery  = z.infer<typeof listMinutasSchema>["query"];
export type MinutaIdParams    = z.infer<typeof minutaIdSchema>["params"];