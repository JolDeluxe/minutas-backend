import { EstadoMinuta, TipoEventoEntrada } from "@prisma/client";
import { prisma } from "../../../db";
import { getIO } from "../../../utils/socket";

type TransitionsMatrix = {
  [key in EstadoMinuta]: EstadoMinuta[];
};

const VALID_TRANSITIONS: TransitionsMatrix = {
  [EstadoMinuta.PROGRAMADA]: [EstadoMinuta.EN_CURSO, EstadoMinuta.CANCELADA],
  [EstadoMinuta.EN_CURSO]: [EstadoMinuta.EN_ORGANIZACION, EstadoMinuta.CANCELADA],
  [EstadoMinuta.EN_ORGANIZACION]: [EstadoMinuta.ACTIVA, EstadoMinuta.CERRADA, EstadoMinuta.EN_CURSO, EstadoMinuta.CANCELADA],
  [EstadoMinuta.ACTIVA]: [EstadoMinuta.CERRADA, EstadoMinuta.CANCELADA, EstadoMinuta.EN_ORGANIZACION, EstadoMinuta.EN_CURSO],
  [EstadoMinuta.CERRADA]: [EstadoMinuta.EN_CURSO, EstadoMinuta.CANCELADA],
  [EstadoMinuta.CANCELADA]: [], 
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
    if (userId && userId > 0) {
      data.cerradoPorId = userId;
    }
    data.cerradoAt = new Date();
  } else if (toState === EstadoMinuta.CANCELADA) {
    if (userId && userId > 0) {
      data.canceladoPorId = userId;
    }
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

  // Emitir evento de socket de cambio de estado
  try {
    const minutaActualizada = await prisma.minuta.findUnique({
      where: { id: minutaId },
    });
    if (minutaActualizada) {
      const io = getIO();
      io.to(`minuta_${minutaId}`).emit("minuta:estado_actualizado", {
        minutaId,
        minuta: minutaActualizada,
      });
    }
  } catch (err) {
    console.error("Error al emitir socket de cambio de estado:", err);
  }
};
