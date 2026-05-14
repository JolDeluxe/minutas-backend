import { z } from "zod";
import {
  Area,
  Prioridad,
  Linea,
  Clasificacion,
  EstadoTarea,
  EstadoConceptual,
  EstadoOperativo,
  TipoAsignacion,
} from "@prisma/client";

const pre = (val: unknown): unknown =>
  val === "" || val === "null" || val === "undefined"
    ? undefined
    : val;

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

const isoFecha = z.coerce
  .date({
    message: "Fecha inválida",
  })
  .optional();

// ─────────────────────────────────────────────────────────────
// ENUM VALUES
// ─────────────────────────────────────────────────────────────

const areaValues = Object.values(Area) as [string, ...string[]];

const prioridadValues = Object.values(Prioridad) as [
  string,
  ...string[]
];

const lineaValues = Object.values(Linea) as [
  string,
  ...string[]
];

const clasifValues = Object.values(Clasificacion) as [
  string,
  ...string[]
];

const estadoValues = Object.values(EstadoTarea) as [
  string,
  ...string[]
];

const estadoConceptualValues = Object.values(
  EstadoConceptual
) as [string, ...string[]];

const estadoOperativoValues = [
  ...Object.values(EstadoOperativo),
  "CERRADO",
] as [string, ...string[]];

const tipoAsignacionValues = Object.values(
  TipoAsignacion
) as [string, ...string[]];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const responsablesField = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return undefined;
      }
    }

    return val;
  },
  z.array(z.coerce.number().int().positive()).optional()
);

// ─────────────────────────────────────────────────────────────
// NOTAS
// ─────────────────────────────────────────────────────────────

const notaTareaInputSchema = z.object({
  contenido: z
    .string()
    .min(1, "El contenido de la nota es requerido"),
});

// ─────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────

const singleTareaSchema = z.object({
  descripcion: z
    .string()
    .min(3, "La descripción es requerida"),

  minutaId: z.preprocess(
    pre,
    z.coerce.number().int().positive().optional()
  ),

  // Captura rápida
  area: z.preprocess(
    pre,
    z.enum(areaValues).default(Area.DISENO)
  ),

  linea: z.preprocess(
    pre,
    z.enum(lineaValues).optional()
  ),

  clasificacion: z.preprocess(
    pre,
    z.enum(clasifValues).optional()
  ),

  fechaSeguimiento: z.preprocess(
    pre,
    z.coerce
      .date({
        message: "Fecha de seguimiento inválida",
      })
      .optional()
  ),

  requiereSeguimiento: z.preprocess(
    (v) => {
      if (v === "true") return true;
      if (v === "false") return false;
      return v;
    },
    z.boolean().optional()
  ),

  // Formalización
  prioridad: z.preprocess(
    pre,
    z.enum(prioridadValues).optional()
  ),

  estadoOperativo: z.preprocess(
    pre,
    z.enum(estadoOperativoValues).optional()
  ),

  fechaVencimiento: z.preprocess(
    pre,
    z.coerce
      .date({
        message: "Fecha de vencimiento inválida",
      })
      .optional()
  ),

  responsables: responsablesField,

  notas: z.array(notaTareaInputSchema).optional(),
});

const tareasArraySchema = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed)
          ? parsed
          : [parsed];
      } catch {
        return undefined;
      }
    }

    return Array.isArray(val) ? val : [val];
  },
  z
    .array(singleTareaSchema)
    .min(1, "Debes enviar al menos una tarea")
);

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

    area: z.preprocess(
      pre,
      z.enum(areaValues).nullable().optional()
    ),

    linea: z.preprocess(
      pre,
      z.enum(lineaValues).nullable().optional()
    ),

    clasificacion: z.preprocess(
      pre,
      z.enum(clasifValues).nullable().optional()
    ),

    prioridad: z.preprocess(
      pre,
      z.enum(prioridadValues).nullable().optional()
    ),

    estadoConceptual: z.preprocess(
      pre,
      z.enum(estadoConceptualValues)
        .nullable()
        .optional()
    ),

    estadoOperativo: z.preprocess(
      pre,
      z.enum(estadoOperativoValues)
        .nullable()
        .optional()
    ),

    fechaSeguimiento: z.preprocess(
      pre,
      z.coerce
        .date({
          message: "Fecha de seguimiento inválida",
        })
        .nullable()
        .optional()
    ),

    fechaVencimiento: z.preprocess(
      pre,
      z.coerce
        .date({
          message: "Fecha de vencimiento inválida",
        })
        .nullable()
        .optional()
    ),

    requiereSeguimiento: z.preprocess(
      (v) => {
        if (v === "true") return true;
        if (v === "false") return false;
        return v;
      },
      z.boolean().nullable().optional()
    ),

    formalizada: z.preprocess(
      (v) => {
        if (v === "true") return true;
        if (v === "false") return false;
        return v;
      },
      z.boolean().nullable().optional()
    ),

    minutaId: z.preprocess(
      pre,
      z.coerce
        .number()
        .int()
        .positive()
        .nullable()
        .optional()
    ),

    responsables: responsablesField,
  }),
});

// ─────────────────────────────────────────────────────────────
// NOTAS
// ─────────────────────────────────────────────────────────────

export const createNotaGeneralSchema = z.object({
  body: z.object({
    contenido: z
      .string()
      .min(1, "El contenido es requerido"),

    minutaId: z.coerce
      .number()
      .int()
      .positive(),
  }),
});

export const createTareaNotaSchema = z.object({
  body: z.object({
    contenido: z
      .string()
      .min(1, "El contenido es requerido"),

    tareaId: z.coerce
      .number()
      .int()
      .positive(),
  }),
});

// ─────────────────────────────────────────────────────────────
// ESTADOS
// ─────────────────────────────────────────────────────────────

export const changeEstadoSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),

  body: z.object({
    estado: z.enum(estadoValues, {
      message: "Estado inválido",
    }),
  }),
});

// ─────────────────────────────────────────────────────────────
// IDS
// ─────────────────────────────────────────────────────────────

export const tareaIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

export const imagenIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),

    imagenId: z.coerce
      .number()
      .int()
      .positive(),
  }),
});

export const deleteTareaSchema = z
  .object({
    params: z.object({
      id: z.coerce
        .number()
        .int()
        .positive("El ID debe ser válido"),
    }),
  })
  .strict();

// ─────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────

export const listTareasSchema = z.object({
  query: z.object({
    q: z.string().optional(),

    estado: z.preprocess(
      parseCsv,
      z.array(z.enum(estadoValues)).optional()
    ),

    estadoConceptual: z.preprocess(
      parseCsv,
      z
        .array(z.enum(estadoConceptualValues))
        .optional()
    ),

    estadoOperativo: z.preprocess(
      parseCsv,
      z
        .array(z.enum(estadoOperativoValues))
        .optional()
    ),

    area: z.preprocess(
      parseCsv,
      z.array(z.enum(areaValues)).optional()
    ),

    linea: z.preprocess(
      parseCsv,
      z.array(z.enum(lineaValues)).optional()
    ),

    clasificacion: z.preprocess(
      parseCsv,
      z.array(z.enum(clasifValues)).optional()
    ),

    prioridad: z.preprocess(
      parseCsv,
      z.array(z.enum(prioridadValues)).optional()
    ),

    minutaId: z.preprocess(
      pre,
      z.coerce.number().int().positive().optional()
    ),

    creadoPorId: z.preprocess(
      pre,
      z.coerce.number().int().positive().optional()
    ),

    responsableId: z.preprocess(
      pre,
      z.coerce.number().int().positive().optional()
    ),

    requiereSeguimiento: z.preprocess(
      (v) => {
        if (v === "true") return true;
        if (v === "false") return false;
        return undefined;
      },
      z.boolean().optional()
    ),

    formalizada: z.preprocess(
      (v) => {
        if (v === "true") return true;
        if (v === "false") return false;
        return undefined;
      },
      z.boolean().optional()
    ),

    isExternalArea: z.preprocess(
      (v) => {
        if (v === "true") return true;
        if (v === "false") return false;
        return undefined;
      },
      z.boolean().optional()
    ),

    capturaCompleta: z.preprocess(
      (v) => {
        if (v === "true") return true;
        if (v === "false") return false;
        return undefined;
      },
      z.boolean().optional()
    ),

    periodo: z.enum(["all", "today", "week", "month"]).optional(),

    atrasadas: z.preprocess(
      (v) => {
        if (v === "true") return true;
        if (v === "false") return false;
        return undefined;
      },
      z.boolean().optional()
    ),

    todo: z.preprocess(
      (v) => {
        if (v === "true") return true;
        if (v === "false") return false;
        return undefined;
      },
      z.boolean().optional()
    ),

    createdDesde: isoFecha,
    createdHasta: isoFecha,

    vencimientoDesde: isoFecha,
    vencimientoHasta: isoFecha,

    completadoDesde: isoFecha,
    completadoHasta: isoFecha,

    seguimientoDesde: isoFecha,
    seguimientoHasta: isoFecha,

    page: z.coerce.number().min(1).default(1),

    limit: z.coerce
      .number()
      .min(1)
      .max(100)
      .default(20),

    sort: z.preprocess(
      (val) => {
        if (typeof val === "string") {
          try {
            return JSON.parse(val);
          } catch {
            return [];
          }
        }

        return val ?? [];
      },

      z
        .array(
          z
            .object({
              createdAt: z
                .enum(["asc", "desc"])
                .optional(),

              fechaVencimiento: z
                .enum(["asc", "desc"])
                .optional(),

              fechaSeguimiento: z
                .enum(["asc", "desc"])
                .optional(),

              completadoAt: z
                .enum(["asc", "desc"])
                .optional(),

              prioridad: z
                .enum(["asc", "desc"])
                .optional(),

              estado: z
                .enum(["asc", "desc"])
                .optional(),
            })
            .strict()
        )
        .default([{ createdAt: "desc" }])
    ),
  }),
});

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type CreateTareaInput =
  z.infer<typeof singleTareaSchema>;

export type UpdateTareaParams =
  z.infer<typeof updateTareaSchema>["params"];

export type UpdateTareaInput =
  z.infer<typeof updateTareaSchema>["body"];

export type CreateNotaGenInput =
  z.infer<typeof createNotaGeneralSchema>["body"];

export type CreateTareaNotaInput =
  z.infer<typeof createTareaNotaSchema>["body"];

export type ChangeEstadoParams =
  z.infer<typeof changeEstadoSchema>["params"];

export type ChangeEstadoInput =
  z.infer<typeof changeEstadoSchema>["body"];

export type TareaIdParams =
  z.infer<typeof tareaIdSchema>["params"];

export type ImagenIdParams =
  z.infer<typeof imagenIdSchema>["params"];

export type ListTareasQuery =
  z.infer<typeof listTareasSchema>["query"];

export type DeleteTareaParams =
  z.infer<typeof deleteTareaSchema>["params"];