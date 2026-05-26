import { EstadoMinuta, EstadoTarea, TipoEntrada } from "@prisma/client";
import { prisma } from "../../../db";
import { transitionMinutaStatus } from "./minuta-transitions";

/**
 * Service to evaluate the true status of a Minuta based on its entries.
 * Evaluates rules:
 * - If there are unorganized entries -> EN_ORGANIZACION
 * - If all organized, but there are active tasks -> ACTIVA
 * - If all organized and no active tasks -> CERRADA
 */
export const evaluateMinutaStatus = async (
  minutaId: number,
  triggeredByUserId: number
): Promise<void> => {
  const minuta = await prisma.minuta.findUnique({
    where: { id: minutaId },
    select: { estado: true, cerradoPorId: true, departamento: true },
  });

  if (!minuta) return;

  const { estado, departamento } = minuta;

  // Solo el evaluador opera sobre minutas que ya pasaron la sesión viva (EN_CURSO)
  // No evaluamos PROGRAMADA, CANCELADA ni EN_CURSO automáticamente porque dependen de acciones manuales directas
  if (
    estado === EstadoMinuta.PROGRAMADA ||
    estado === EstadoMinuta.EN_CURSO ||
    estado === EstadoMinuta.CANCELADA
  ) {
    return;
  }

  const entradas = await prisma.tarea.findMany({
    where: { minutaId, tipo: { not: TipoEntrada.DESCARTADA } },
    select: { tipo: true, estado: true, area: true },
  });

  // Filtrar solo entradas internas (las externas no bloquean la minuta)
  const entradasInternas = entradas.filter((e) => {
    // Si no tiene area, se considera interna (pendiente de clasificar)
    if (!e.area) return true;
    
    // Si tiene area, comparamos con el departamento de la minuta
    // Solo es interna si el area coincide exactamente con el departamento
    return (e.area as string) === (departamento as string);
  });

  if (entradasInternas.length === 0) {
    // Si no tiene entradas operativas y estaba en organizacion o activa, se puede cerrar directo
    if (estado !== EstadoMinuta.CERRADA) {
      await transitionMinutaStatus(minutaId, EstadoMinuta.CERRADA, triggeredByUserId);
    }
    return;
  }

  const hasUnorganizedEntries = entradasInternas.some((e) => e.tipo === TipoEntrada.SIN_ORGANIZAR);
  
  // Consideramos seguimiento activo a cualquier entrada (principalmente TAREAS) que tenga estado PENDIENTE o EN_REVISION.
  const hasActiveTracking = entradasInternas.some(
    (e) =>
      (e.tipo === TipoEntrada.TAREA || e.estado != null) &&
      e.estado !== EstadoTarea.CERRADA &&
      e.estado !== EstadoTarea.CANCELADA
  );

  let targetState: EstadoMinuta = estado;

  if (hasUnorganizedEntries) {
    targetState = EstadoMinuta.EN_ORGANIZACION;
  } else if (hasActiveTracking) {
    targetState = EstadoMinuta.ACTIVA;
  } else {
    targetState = EstadoMinuta.CERRADA;
  }

  if (targetState !== estado) {
    try {
      await transitionMinutaStatus(minutaId, targetState, triggeredByUserId);
    } catch (error) {
      console.error(`Error auto-evaluating minuta status for ID ${minutaId}:`, error);
    }
  }
};
