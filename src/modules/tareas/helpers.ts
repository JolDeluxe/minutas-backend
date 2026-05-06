import { Area, EstadoTarea, EstadoAsignacion } from "@prisma/client";
import { prisma } from "../../db";

export const calcularIsExternalArea = (area: Area | null | undefined): boolean => {
  if (!area) return false;
  return area !== Area.DISENO;
};

export const calcularCapturaCompleta = (params: {
  clasificacion:     string | null | undefined;
  fechaVencimiento:  Date   | null | undefined;
  totalAsignaciones: number;
}): boolean => {
  return (
    params.clasificacion    != null &&
    params.fechaVencimiento != null &&
    params.totalAsignaciones > 0
  );
};

export const registrarCambio = async (
  tareaId:    number,
  usuarioId:  number,
  campo:      string,
  valorAntes: string | null,
  valorDespues: string | null
) => {
  await prisma.tareaHistorial.create({
    data: { tareaId, usuarioId, campo, valorAntes, valorDespues },
  });
};

export const evaluarEstadoMinuta = async (minutaId: number) => {
  const tareas = await prisma.tarea.findMany({ where: { minutaId } });
  if (tareas.length === 0) return;

  const todasCerradas = tareas.every(t => t.estado === EstadoTarea.CERRADO);
  
  await prisma.minuta.update({
    where: { id: minutaId },
    data: { estado: todasCerradas ? 'CERRADA' : 'ACTIVA' }
  });
};