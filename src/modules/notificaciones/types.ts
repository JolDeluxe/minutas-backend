import type { Tarea, Usuario, TareaAsignacion } from "@prisma/client";

export interface PayloadBase {
  titulo: string;
  cuerpo: string;
  url: string;
}

export type TareaConRelaciones = Tarea & {
  asignaciones?: (TareaAsignacion & {
    usuario: Pick<Usuario, "id" | "nombre">;
  })[];
  creadoPor?: Pick<Usuario, "id" | "nombre"> | null;
  minuta?: { id: number; titulo: string } | null;
};