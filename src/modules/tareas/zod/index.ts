import { z } from "zod";
import {
  Area,
  Prioridad,
  EstadoTarea,
  TipoEntrada,
  AlcanceRecordatorio,
} from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// HELPERS & PREPROCESSORS
// ─────────────────────────────────────────────────────────────

const pre = (val: unknown): unknown =>
  val === "" || val === "null" || val === "undefined" ? undefined : val;

const parseCsv = (val: unknown): unknown => {
  if (typeof val === "string" && val.trim() !== "") {
    return val
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (Array.isArray(val)) return val;
  return undefined;
};

const parseBool = (v: unknown): unknown => {
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
};

const isoFecha = z.preprocess(
  pre,
  z.coerce.date({ message: "Fecha inválida" }).optional()
);

const responsablesField = z.preprocess((val) => {
  if (!val) return undefined;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return undefined;
    }
  }
  return val;
}, z.array(z.coerce.number().int().positive()).optional());

// ─────────────────────────────────────────────────────────────
// NOTAS
// ─────────────────────────────────────────────────────────────

const notaTareaInputSchema = z.object({
  contenido: z.string().min(1, "El contenido de la nota es requerido"),
});

export const createNotaGeneralSchema = z.object({
  body: z.object({
    contenido: z.string().min(1, "El contenido es requerido"),
    minutaId: z.coerce.number().int().positive(),
  }),
});

export const createTareaNotaSchema = z.object({
  body: z.object({
    contenido: z.string().min(1, "El contenido es requerido"),
    tareaId: z.coerce.number().int().positive(),
  }),
});

// ─────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────

const singleTareaSchema = z.object({
  descripcion: z.string().min(3, "La descripción es requerida"),
  minutaId: z.preprocess(pre, z.coerce.number().int().positive().optional()),

  // Captura rápida
  area: z.preprocess(pre, z.nativeEnum(Area).default(Area.DISENO)),
  linea: z.preprocess(pre, z.string().optional()),
  clasificacion: z.preprocess(pre, z.string().optional()),

  // Clasificación post-junta
  tipo: z.preprocess(pre, z.nativeEnum(TipoEntrada).optional()),
  estado: z.preprocess(pre, z.nativeEnum(EstadoTarea).optional()),
  alcanceRecordatorio: z.preprocess(pre, z.nativeEnum(AlcanceRecordatorio).optional()),

  // Formalización
  prioridad: z.preprocess(pre, z.nativeEnum(Prioridad).optional()),
  fechaVencimiento: z.preprocess(
    pre,
    z.coerce.date({ message: "Fecha de vencimiento inválida" }).optional()
  ),

  responsables: responsablesField,
  notas: z.array(notaTareaInputSchema).optional(),
});

const tareasArraySchema = z.preprocess((val) => {
  if (!val) return undefined;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return undefined;
    }
  }
  return Array.isArray(val) ? val : [val];
}, z.array(singleTareaSchema).min(1, "Debes enviar al menos una tarea"));

export const createTareaSchema = z.object({
  body: z.object({
    tareas: tareasArraySchema,
  }),
});

// ─────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────

export const updateTareaSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    descripcion: z.string().min(3).optional(),
    area: z.preprocess(pre, z.nativeEnum(Area).nullable().optional()),
    linea: z.preprocess(pre, z.string().nullable().optional()),
    clasificacion: z.preprocess(pre, z.string().nullable().optional()),
    
    tipo: z.preprocess(pre, z.nativeEnum(TipoEntrada).nullable().optional()),
    estado: z.preprocess(pre, z.nativeEnum(EstadoTarea).nullable().optional()),
    alcanceRecordatorio: z.preprocess(pre, z.nativeEnum(AlcanceRecordatorio).nullable().optional()),
    
    prioridad: z.preprocess(pre, z.nativeEnum(Prioridad).nullable().optional()),
    
    fechaVencimiento: z.preprocess(
      pre,
      z.coerce.date({ message: "Fecha de vencimiento inválida" }).nullable().optional()
    ),
    
    minutaId: z.preprocess(pre, z.coerce.number().int().positive().nullable().optional()),
    responsables: responsablesField,
  }),
});

// ─────────────────────────────────────────────────────────────
// ESTADOS E IDS
// ─────────────────────────────────────────────────────────────

export const changeEstadoSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    estado: z.nativeEnum(EstadoTarea, { message: "Estado inválido" }),
  }),
});

export const tareaIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

export const imagenIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
    imagenId: z.coerce.number().int().positive(),
  }),
});

export const deleteTareaSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive("El ID debe ser válido"),
  }),
}).strict();

// ─────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────

export const listTareasSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    
    tipo: z.preprocess(parseCsv, z.array(z.nativeEnum(TipoEntrada)).optional()),
    estado: z.preprocess(parseCsv, z.array(z.nativeEnum(EstadoTarea)).optional()),
    alcanceRecordatorio: z.preprocess(parseCsv, z.array(z.nativeEnum(AlcanceRecordatorio)).optional()),
    
    area: z.preprocess(parseCsv, z.array(z.nativeEnum(Area)).optional()),
    linea: z.preprocess(parseCsv, z.array(z.string()).optional()),
    clasificacion: z.preprocess(parseCsv, z.array(z.string()).optional()),
    prioridad: z.preprocess(parseCsv, z.array(z.nativeEnum(Prioridad)).optional()),
    
    minutaId: z.preprocess(pre, z.coerce.number().int().positive().optional()),
    creadoPorId: z.preprocess(pre, z.coerce.number().int().positive().optional()),
    responsableId: z.preprocess(pre, z.coerce.number().int().positive().optional()),
    organizadoPorId: z.preprocess(pre, z.coerce.number().int().positive().optional()),
    
    isExternalArea: z.preprocess(parseBool, z.boolean().optional()),
    atrasadas: z.preprocess(parseBool, z.boolean().optional()),
    todo: z.preprocess(parseBool, z.boolean().optional()),
    
    periodo: z.enum(["all", "today", "week", "month"]).optional(),
    
    createdDesde: isoFecha,
    createdHasta: isoFecha,
    vencimientoDesde: isoFecha,
    vencimientoHasta: isoFecha,
    completadoDesde: isoFecha,
    completadoHasta: isoFecha,
    
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    
    sort: z.preprocess((val) => {
      if (!val || val === "") return [];
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch {
          return [];
        }
      }
      return val ?? [];
    }, z.array(
      z.object({
        createdAt: z.enum(["asc", "desc"]).optional(),
        fechaVencimiento: z.enum(["asc", "desc"]).optional(),
        completadoAt: z.enum(["asc", "desc"]).optional(),
        prioridad: z.enum(["asc", "desc"]).optional(),
        estado: z.enum(["asc", "desc"]).optional(),
      }).strict()
    ).default([{ createdAt: "desc" }])),
  }),
});

// ─────────────────────────────────────────────────────────────
// ORGANIZAR
// ─────────────────────────────────────────────────────────────

export const organizarTareaSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    tipo: z.nativeEnum(TipoEntrada),
    estado: z.nativeEnum(EstadoTarea).optional(),
    alcanceRecordatorio: z.nativeEnum(AlcanceRecordatorio).optional(),
    prioridad: z.nativeEnum(Prioridad).optional(),
    fechaVencimiento: z.preprocess(
      pre,
      z.coerce.date({ message: "Fecha de vencimiento inválida" }).optional()
    ),
    responsables: responsablesField,
  }),
});

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type CreateTareaInput = z.infer<typeof singleTareaSchema>;
export type UpdateTareaParams = z.infer<typeof updateTareaSchema>["params"];
export type UpdateTareaInput = z.infer<typeof updateTareaSchema>["body"];
export type CreateNotaGenInput = z.infer<typeof createNotaGeneralSchema>["body"];
export type CreateTareaNotaInput = z.infer<typeof createTareaNotaSchema>["body"];
export type ChangeEstadoParams = z.infer<typeof changeEstadoSchema>["params"];
export type ChangeEstadoInput = z.infer<typeof changeEstadoSchema>["body"];
export type TareaIdParams = z.infer<typeof tareaIdSchema>["params"];
export type ImagenIdParams = z.infer<typeof imagenIdSchema>["params"];
export type ListTareasQuery = z.infer<typeof listTareasSchema>["query"];
export type DeleteTareaParams = z.infer<typeof deleteTareaSchema>["params"];
export type OrganizarTareaParams = z.infer<typeof organizarTareaSchema>["params"];
export type OrganizarTareaInput = z.infer<typeof organizarTareaSchema>["body"];