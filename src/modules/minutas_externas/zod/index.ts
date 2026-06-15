import { z } from "zod";
import { Area, EstadoTarea, Prioridad } from "@prisma/client";

const pre = (val: unknown): unknown =>
  val === "" || val === "null" || val === "undefined" ? undefined : val;

const parseCsv = (val: unknown): unknown => {
  if (typeof val === "string" && val.trim() !== "") {
    return val.split(",").map((v) => v.trim()).filter(Boolean);
  }
  if (Array.isArray(val)) return val;
  return undefined;
};

const isoFecha = z.preprocess(
  pre,
  z.coerce.date({ message: "Fecha inválida" }).optional()
);

// ─── MINUTAS EXTERNAS ─────────────────────────────────────────────────────────

export const createMinutaExternaSchema = z.object({
  body: z.object({
    tema: z.string().min(3, "El tema debe tener al menos 3 caracteres").max(200),
    area: z.nativeEnum(Area),
    departamento: z.preprocess(pre, z.string().max(100).optional()),
    objetivo: z.preprocess(pre, z.string().optional()),
    integrantes: z.preprocess(pre, z.string().optional()), // JSON string de array
    asistentes: z.preprocess(pre, z.string().optional()),   // JSON string de array
    fechaProgramada: isoFecha.optional(),
  }),
});

export const updateMinutaExternaSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    tema: z.string().min(3).max(200).optional(),
    area: z.nativeEnum(Area).optional(),
    departamento: z.preprocess(pre, z.string().max(100).nullable().optional()),
    objetivo: z.preprocess(pre, z.string().nullable().optional()),
    integrantes: z.preprocess(pre, z.string().nullable().optional()),
    asistentes: z.preprocess(pre, z.string().nullable().optional()),
    resumenTemas: z.preprocess(pre, z.string().nullable().optional()),
    resumenAcuerdos: z.preprocess(pre, z.string().nullable().optional()),
    resumenProximosPasos: z.preprocess(pre, z.string().nullable().optional()),
    fechaProgramada: isoFecha.optional(),
  }),
});

export const listMinutasExternasSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    area: z.preprocess(parseCsv, z.array(z.nativeEnum(Area)).optional()),
    estado: z.preprocess(parseCsv, z.array(z.enum(["ACTIVA", "CERRADA", "CANCELADA"])).optional()),
    page:  z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
  }),
});

export const minutaExternaIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

// ─── TAREAS EXTERNAS ──────────────────────────────────────────────────────────

export const createTareaExternaSchema = z.object({
  params: z.object({
    minutaId: z.coerce.number().int().positive(),
  }),
  body: z.object({
    tareas: z.preprocess((val) => {
      if (!val) return undefined;
      if (typeof val === "string") {
        try { return JSON.parse(val); } catch { return undefined; }
      }
      return Array.isArray(val) ? val : [val];
    }, z.array(z.object({
      descripcion: z.string().min(3, "La descripción es requerida"),
      area: z.nativeEnum(Area),
      departamento: z.preprocess(pre, z.string().max(100).nullable().optional()),
      estado: z.preprocess(pre, z.nativeEnum(EstadoTarea).nullable().optional()),
      prioridad: z.preprocess(pre, z.nativeEnum(Prioridad).nullable().optional()),
      fechaVencimiento: z.preprocess(
        pre,
        z.coerce.date({ message: "Fecha de vencimiento inválida" }).nullable().optional()
      ),
      notas: z.array(z.object({ contenido: z.string().min(1) })).optional(),
    })).min(1, "Debes enviar al menos una tarea")),
  }),
});

export const updateTareaExternaSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    descripcion: z.string().min(3).optional(),
    area: z.nativeEnum(Area).optional(),
    departamento: z.preprocess(pre, z.string().max(100).nullable().optional()),
    estado: z.preprocess(pre, z.nativeEnum(EstadoTarea).nullable().optional()),
    prioridad: z.preprocess(pre, z.nativeEnum(Prioridad).nullable().optional()),
    fechaVencimiento: z.preprocess(
      pre,
      z.coerce.date({ message: "Fecha de vencimiento inválida" }).nullable().optional()
    ),
  }),
});

export const tareaExternaIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

export const imagenTareaExternaIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
    imagenId: z.coerce.number().int().positive(),
  }),
});

export const createTareaExternaNotaSchema = z.object({
  body: z.object({
    contenido: z.string().min(1, "El contenido es requerido"),
    tareaExternaId: z.coerce.number().int().positive(),
  }),
});

export const changeEstadoTareaExternaSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    estado: z.nativeEnum(EstadoTarea, { message: "Estado inválido" }),
  }),
});

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type CreateMinutaExternaInput    = z.infer<typeof createMinutaExternaSchema>["body"];
export type UpdateMinutaExternaInput    = z.infer<typeof updateMinutaExternaSchema>["body"];
export type ListMinutasExternasQuery    = z.infer<typeof listMinutasExternasSchema>["query"];
export type MinutaExternaIdParams       = z.infer<typeof minutaExternaIdSchema>["params"];
export type CreateTareaExternaInput     = z.infer<typeof createTareaExternaSchema>["body"];
export type UpdateTareaExternaInput     = z.infer<typeof updateTareaExternaSchema>["body"];
export type TareaExternaIdParams        = z.infer<typeof tareaExternaIdSchema>["params"];
export type CreateTareaExternaNotaInput = z.infer<typeof createTareaExternaNotaSchema>["body"];
export type ChangeEstadoTareaExternaInput = z.infer<typeof changeEstadoTareaExternaSchema>["body"];
