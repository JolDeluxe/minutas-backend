import { z } from "zod";
import { EstadoMinuta } from "@prisma/client";

const estadoValues = Object.values(EstadoMinuta) as [string, ...string[]];

const pre = (val: unknown): unknown =>
  val === "" || val === "null" || val === "undefined" ? undefined : val;

const parseCsv = (val: unknown): unknown => {
  if (typeof val === "string" && val.trim() !== "") {
    const list = val.split(",").map((v) => v.trim()).filter(Boolean);
    const filtered = list.filter((v) => v !== "TODAS" && v !== "");
    return filtered.length > 0 ? filtered : undefined;
  }
  if (Array.isArray(val)) {
    const filtered = val.filter((v) => v !== "TODAS" && v !== "");
    return filtered.length > 0 ? filtered : undefined;
  }
  return undefined;
};

const isoFecha = z.coerce.date({ 
  message: "Fecha inválida" 
}).optional();

export const createMinutaSchema = z.object({
  body: z.object({
    titulo:       z.string().min(3, "El título debe tener al menos 3 caracteres").max(200),
    lineaDefault: z.string().optional(),
    fechaProgramada: z.string().datetime({ message: "Fecha programada inválida" }),
    iniciarInmediatamente: z.boolean().optional().default(false),
    departamento: z.enum(["DISENO", "MARKETING"]).optional(),
  }),
});

export const listMinutasSchema = z.object({
  query: z.object({
    // Búsqueda de texto en título
    q: z.string().optional(),

    // Filtros multi-valor vía CSV
    estado:       z.preprocess(parseCsv, z.array(z.enum(estadoValues)).optional()),
    lineaDefault: z.preprocess(parseCsv, z.array(z.string()).optional()),
    departamentoGlobal: z.enum(["TODAS", "DISEÑO", "MARKETING"]).optional(),

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

    // Ordenamiento (Parseo y transformación automatizada de "fecha" -> "fechaProgramada")
    sort: z.preprocess(
      (val) => {
        if (typeof val === "string") { 
          try { return JSON.parse(val); } catch { return undefined; } 
        }
        return val;
      },
      z
        .array(
          z
            .object({
              id:              z.enum(["asc", "desc"]).optional(),
              lineaDefault:    z.enum(["asc", "desc"]).optional(),
              estado:          z.enum(["asc", "desc"]).optional(),
              fecha:           z.enum(["asc", "desc"]).optional(),
              fechaProgramada: z.enum(["asc", "desc"]).optional(),
              fechaRealizada:  z.enum(["asc", "desc"]).optional(),
              titulo:          z.enum(["asc", "desc"]).optional(),
              createdAt:       z.enum(["asc", "desc"]).optional(),
            })
            .strict()
        )
        .optional()
    ).transform((arr) => {
      if (!arr) return undefined;
      // Remapea estructuralmente la propiedad para que coincida con el nuevo esquema de la base de datos
      return arr.map((item) => {
        const { fecha, ...rest } = item;
        if (fecha) {
          return { ...rest, fechaProgramada: fecha };
        }
        return item;
      });
    }),
  }),
});

export const updateMinutaSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    titulo:       z.string().min(3, "El título debe tener al menos 3 caracteres").max(200).optional(),
    lineaDefault: z.string().optional().nullable(),
    fechaProgramada: z.string().datetime({ message: "Fecha programada inválida" }).optional(),
    departamento: z.enum(["DISENO", "MARKETING"]).optional(),
  }),
});

export const minutaIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

export type CreateMinutaInput = z.infer<typeof createMinutaSchema>["body"];
export type UpdateMinutaInput = z.infer<typeof updateMinutaSchema>["body"];
export type ListMinutasQuery  = z.infer<typeof listMinutasSchema>["query"];
export type MinutaIdParams    = z.infer<typeof minutaIdSchema>["params"];