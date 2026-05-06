import { z } from "zod";
import { Linea, EstadoMinuta } from "@prisma/client";

const lineaValues  = Object.values(Linea)        as [string, ...string[]];
const estadoValues = Object.values(EstadoMinuta) as [string, ...string[]];

export const createMinutaSchema = z.object({
  body: z.object({
    titulo:       z.string().min(3, "El título debe tener al menos 3 caracteres").max(200),
    lineaDefault: z.enum(lineaValues, { message: "Línea inválida" }),
  }),
});

export const listMinutasSchema = z.object({
  query: z.object({
    page:   z.coerce.number().min(1).default(1),
    limit:  z.coerce.number().min(1).max(100).default(20),
    estado: z.enum(estadoValues).optional(),
    q:      z.string().optional(),
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