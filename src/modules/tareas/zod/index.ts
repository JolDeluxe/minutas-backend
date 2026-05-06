import { z } from "zod";
import { Area, Prioridad, Linea, Clasificacion, EstadoTarea } from "@prisma/client";

const pre = (val: unknown) =>
  val === "" || val === "null" || val === "undefined" ? undefined : val;

const areaValues     = Object.values(Area)          as [string, ...string[]];
const prioridadValues = Object.values(Prioridad)    as [string, ...string[]];
const lineaValues    = Object.values(Linea)          as [string, ...string[]];
const clasifValues   = Object.values(Clasificacion) as [string, ...string[]];
const estadoValues   = Object.values(EstadoTarea)   as [string, ...string[]];

const responsablesField = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      try { return JSON.parse(val); } catch { return undefined; }
    }
    return val;
  },
  z.array(z.coerce.number().int().positive()).optional()
);

export const createTareaSchema = z.object({
  body: z.object({
    descripcion:      z.string().min(3, "La descripción es requerida"),
    minutaId:         z.preprocess(pre, z.coerce.number().int().positive().optional()),
    area:             z.preprocess(pre, z.enum(areaValues).optional()),
    prioridad:        z.preprocess(pre, z.enum(prioridadValues).optional()),
    linea:            z.preprocess(pre, z.enum(lineaValues).optional()),
    clasificacion:    z.preprocess(pre, z.enum(clasifValues).optional()),
    fechaVencimiento: z.preprocess(pre, z.string().optional()),
    responsables:     responsablesField,
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

export const listTareasSchema = z.object({
  query: z.object({
    page:           z.coerce.number().min(1).default(1),
    limit:          z.coerce.number().min(1).max(100).default(20),
    estado:         z.preprocess(pre, z.enum(estadoValues).optional()),
    area:           z.preprocess(pre, z.enum(areaValues).optional()),
    minutaId:       z.preprocess(pre, z.coerce.number().int().positive().optional()),
    isExternalArea: z.preprocess((v) => v === "true" ? true : v === "false" ? false : undefined, z.boolean().optional()),
    isComplete:     z.preprocess((v) => v === "true" ? true : v === "false" ? false : undefined, z.boolean().optional()),
    q:              z.string().optional(),
  }),
});

export type CreateTareaInput  = z.infer<typeof createTareaSchema>["body"];
export type UpdateTareaInput  = z.infer<typeof updateTareaSchema>["body"];
export type UpdateTareaParams = z.infer<typeof updateTareaSchema>["params"];
export type ChangeEstadoInput  = z.infer<typeof changeEstadoSchema>["body"];
export type ChangeEstadoParams = z.infer<typeof changeEstadoSchema>["params"];
export type TareaIdParams      = z.infer<typeof tareaIdSchema>["params"];
export type ImagenIdParams     = z.infer<typeof imagenIdSchema>["params"];
export type ListTareasQuery    = z.infer<typeof listTareasSchema>["query"];