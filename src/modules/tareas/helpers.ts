import { Area, EstadoTarea, EstadoMinuta } from "@prisma/client";
import { prisma } from "../../db";

/**
 * Determina si el área no pertenece a DISEÑO para marcarla como externa.
 */
export const calcularIsExternalArea = (area: Area | null | undefined): boolean => {
  if (!area) return false;
  return area !== Area.DISENO;
};

/**
 * Verifica si una tarea tiene los campos mínimos de la Fase 2 (Asignación) 
 * para considerarse con "Captura Completa".
 */
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

/**
 * Registra un movimiento en la tabla de historial de la tarea.
 */
export const registrarCambio = async (
  tareaId:      number,
  usuarioId:    number,
  campo:        string,
  valorAntes:   string | null,
  valorDespues: string | null
) => {
  await prisma.tareaHistorial.create({
    data: {
      tareaId,
      usuarioId,
      campo,
      valorAntes:  valorAntes  ? String(valorAntes)  : null,
      valorDespues: valorDespues ? String(valorDespues) : null,
    },
  });
};

/**
 * Revisa el estado de todas las tareas de una minuta. 
 * Si todas están CERRADAS, cierra la minuta automáticamente.
 */
export const evaluarEstadoMinuta = async (minutaId: number) => {
  const tareas = await prisma.tarea.findMany({ 
    where: { minutaId },
    select: { estado: true }
  });

  if (tareas.length === 0) return;

  const todasCerradas = tareas.every(t => t.estado === EstadoTarea.CERRADO);
  
  await prisma.minuta.update({
    where: { id: minutaId },
    data: { 
      estado: todasCerradas ? EstadoMinuta.CERRADA : EstadoMinuta.ACTIVA 
    }
  });
};