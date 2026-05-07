import { z } from "zod";
import { Area, Prioridad, Linea, Clasificacion, EstadoTarea } from "@prisma/client";

const pre = (val: unknown): unknown =>
  val === "" || val === "null" || val === "undefined" ? undefined : val;

const parseCsv = (val: unknown): unknown => {
  if (typeof val === "string" && val.trim() !== "")
    return val.split(",").map((v) => v.trim()).filter(Boolean);
  if (Array.isArray(val)) return val;
  return undefined;
};

const isoFecha = z.preprocess(
  pre,
  z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
      "Formato requerido: ISO 8601 UTC — ej: 2025-01-01T00:00:00.000Z"
    )
    .optional()
);

const areaValues      = Object.values(Area)          as [string, ...string[]];
const prioridadValues = Object.values(Prioridad)     as [string, ...string[]];
const lineaValues     = Object.values(Linea)          as [string, ...string[]];
const clasifValues    = Object.values(Clasificacion)  as [string, ...string[]];
const estadoValues    = Object.values(EstadoTarea)    as [string, ...string[]];

const responsablesField = z.preprocess(
  (val) => {
    if (typeof val === "string") { try { return JSON.parse(val); } catch { return undefined; } }
    return val;
  },
  z.array(z.coerce.number().int().positive()).optional()
);

const notaTareaInputSchema = z.object({
  contenido: z.string().min(1, "El contenido de la nota es requerido"),
});

const singleTareaSchema = z.object({
  descripcion:      z.string().min(3, "La descripción es requerida"),
  minutaId:         z.preprocess(pre, z.coerce.number().int().positive().optional()),
  area:             z.preprocess(pre, z.enum(areaValues).default(Area.DISENO)),
  prioridad:        z.preprocess(pre, z.enum(prioridadValues).optional()),
  linea:            z.preprocess(pre, z.enum(lineaValues).optional()),
  clasificacion:    z.preprocess(pre, z.enum(clasifValues).optional()),
  fechaVencimiento: z.preprocess(pre, z.string().optional()),
  responsables:     responsablesField,
  notas:            z.array(notaTareaInputSchema).optional(),
});

const tareasArraySchema = z.preprocess((val) => {
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch { return undefined; }
  }
  return Array.isArray(val) ? val : [val];
}, z.array(singleTareaSchema).min(1, "Debes enviar al menos una tarea"));

export const createTareaSchema = z.object({
  body: z.object({
    tareas: tareasArraySchema,
  }),
});

export const updateTareaSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    descripcion:      z.string().min(3).optional(),
    area:             z.preprocess(pre, z.enum(areaValues).nullable().optional()),
    prioridad:        z.preprocess(pre, z.enum(prioridadValues).nullable().optional()),
    linea:            z.preprocess(pre, z.enum(lineaValues).nullable().optional()),
    clasificacion:    z.preprocess(pre, z.enum(clasifValues).nullable().optional()),
    fechaVencimiento: z.preprocess(pre, z.string().nullable().optional()),
    minutaId:         z.preprocess(pre, z.coerce.number().int().positive().nullable().optional()),
    responsables:     responsablesField,
  }),
});

export const createNotaGeneralSchema = z.object({
  body: z.object({
    contenido: z.string().min(1, "El contenido es requerido"),
    minutaId:  z.coerce.number().int().positive(),
  }),
});

export const createTareaNotaSchema = z.object({
  body: z.object({
    contenido: z.string().min(1, "El contenido es requerido"),
    tareaId:   z.coerce.number().int().positive(),
  }),
});

export const changeEstadoSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    estado: z.enum(estadoValues, { message: "Estado inválido" }),
  }),
});

export const tareaIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

export const imagenIdSchema = z.object({
  params: z.object({
    id:       z.coerce.number().int().positive(),
    imagenId: z.coerce.number().int().positive(),
  }),
});

// Se usa coerce para asegurar que Prisma reciba un entero en el controlador
export const deleteTareaSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive("El ID debe ser numérico")
  })
});

export const listTareasSchema = z.object({
  query: z.object({
    // Búsqueda de texto
    q: z.string().optional(),

    // Filtros multi-valor vía CSV (?estado=PENDIENTE,EN_PROGRESO)
    estado:       z.preprocess(parseCsv, z.array(z.enum(estadoValues)).optional()),
    area:         z.preprocess(parseCsv, z.array(z.enum(areaValues)).optional()),
    linea:        z.preprocess(parseCsv, z.array(z.enum(lineaValues)).optional()),
    clasificacion: z.preprocess(parseCsv, z.array(z.enum(clasifValues)).optional()),
    prioridad:    z.preprocess(parseCsv, z.array(z.enum(prioridadValues)).optional()),

    // Filtros de ID
    minutaId:      z.preprocess(pre, z.coerce.number().int().positive().optional()),
    creadoPorId:   z.preprocess(pre, z.coerce.number().int().positive().optional()),
    responsableId: z.preprocess(pre, z.coerce.number().int().positive().optional()),

    // Filtros booleanos
    isExternalArea:  z.preprocess(
      (v) => (v === "true" ? true : v === "false" ? false : undefined),
      z.boolean().optional()
    ),
    capturaCompleta: z.preprocess(
      (v) => (v === "true" ? true : v === "false" ? false : undefined),
      z.boolean().optional()
    ),

    // Rangos de fecha (ISO 8601 UTC estricto)
    createdDesde:      isoFecha,
    createdHasta:      isoFecha,
    vencimientoDesde:  isoFecha,
    vencimientoHasta:  isoFecha,
    completadoDesde:   isoFecha,
    completadoHasta:   isoFecha,

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
              createdAt:        z.enum(["asc", "desc"]).optional(),
              fechaVencimiento: z.enum(["asc", "desc"]).optional(),
              completadoAt:     z.enum(["asc", "desc"]).optional(),
              prioridad:        z.enum(["asc", "desc"]).optional(),
              estado:           z.enum(["asc", "desc"]).optional(),
            })
            .strict()
        )
        .default([{ createdAt: "desc" }])
    ),
  }),
});

export type CreateTareaInput     = z.infer<typeof singleTareaSchema>;
export type UpdateTareaInput     = z.infer<typeof updateTareaSchema>["body"];
export type UpdateTareaParams    = z.infer<typeof updateTareaSchema>["params"];
export type CreateNotaGenInput   = z.infer<typeof createNotaGeneralSchema>["body"];
export type CreateTareaNotaInput = z.infer<typeof createTareaNotaSchema>["body"];
export type ChangeEstadoInput    = z.infer<typeof changeEstadoSchema>["body"];
export type ChangeEstadoParams   = z.infer<typeof changeEstadoSchema>["params"];
export type TareaIdParams        = z.infer<typeof tareaIdSchema>["params"];
export type ImagenIdParams       = z.infer<typeof imagenIdSchema>["params"];
export type ListTareasQuery      = z.infer<typeof listTareasSchema>["query"];
export type DeleteTareaParams    = z.infer<typeof deleteTareaSchema>["params"];