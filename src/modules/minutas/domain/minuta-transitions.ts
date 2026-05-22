import { EstadoMinuta, TipoEventoEntrada } from "@prisma/client";
import { prisma } from "../../../db";

type TransitionsMatrix = {
  [key in EstadoMinuta]: EstadoMinuta[];
};

const VALID_TRANSITIONS: TransitionsMatrix = {
  [EstadoMinuta.PROGRAMADA]: [EstadoMinuta.EN_CURSO, EstadoMinuta.CANCELADA],
  [EstadoMinuta.EN_CURSO]: [EstadoMinuta.EN_ORGANIZACION, EstadoMinuta.CANCELADA],
  [EstadoMinuta.EN_ORGANIZACION]: [EstadoMinuta.ACTIVA, EstadoMinuta.CERRADA],
  [EstadoMinuta.ACTIVA]: [EstadoMinuta.CERRADA, EstadoMinuta.CANCELADA, EstadoMinuta.EN_ORGANIZACION], // Added EN_ORGANIZACION to allow regression if new unorganized entries appear
  [EstadoMinuta.CERRADA]: [EstadoMinuta.EN_ORGANIZACION, EstadoMinuta.ACTIVA], // Added ACTIVA and EN_ORGANIZACION for reopening
  [EstadoMinuta.CANCELADA]: [], // Terminal state, though we might allow reopening if necessary later
};

export const transitionMinutaStatus = async (
  minutaId: number,
  toState: EstadoMinuta,
  userId: number
): Promise<void> => {
  const minuta = await prisma.minuta.findUnique({
    where: { id: minutaId },
    select: { estado: true },
  });

  if (!minuta) {
    throw new Error(`Minuta ${minutaId} no encontrada`);
  }

  const fromState = minuta.estado;

  if (fromState === toState) {
    // No transition needed
    return;
  }

  const allowed = VALID_TRANSITIONS[fromState]?.includes(toState);
  if (!allowed) {
    throw new Error(`Transición inválida de minuta: ${fromState} -> ${toState}`);
  }

  // Effectuate transition
  const data: any = { estado: toState };
  if (toState === EstadoMinuta.EN_CURSO) {
    data.fechaRealizada = new Date();
  } else if (toState === EstadoMinuta.CERRADA) {
    data.cerradoPorId = userId;
    data.cerradoAt = new Date();
  } else if (toState === EstadoMinuta.CANCELADA) {
    data.canceladoPorId = userId;
    data.canceladoAt = new Date();
  }

  // Si salimos de CERRADA o CANCELADA, limpiamos esos campos (ej. Reabrir)
  if (fromState === EstadoMinuta.CERRADA) {
    data.cerradoPorId = null;
    data.cerradoAt = null;
  }
  if (fromState === EstadoMinuta.CANCELADA) {
    data.canceladoPorId = null;
    data.canceladoAt = null;
  }

  await prisma.minuta.update({
    where: { id: minutaId },
    data,
  });

  // Log to bitacora
  await prisma.bitacora.create({
    data: {
      accion: "CAMBIO_ESTADO_MINUTA",
      detalles: JSON.stringify({
        minutaId,
        from: fromState,
        to: toState,
        triggeredBy: userId,
      }),
      usuarioId: userId,
    },
  });
};
