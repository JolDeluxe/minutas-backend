import { prisma } from "../../db";
import { TipoNotificacion } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import { getIO } from "../../utils/socket";

/**
 * Persiste notificaciones en BD y las emite en tiempo real por Socket.io.
 * Es la capa de entrega central del ecosistema de minutas.
 * No depende de webpush ni VAPID.
 */
export const persistirYEmitir = async (
  usuarioIds: number[],
  tipo: TipoNotificacion,
  titulo: string,
  cuerpo: string,
  tareaId?: number
): Promise<void> => {
  const uniqueIds = [...new Set(usuarioIds)].filter((id) => id > 0);
  if (uniqueIds.length === 0) return;

  try {
    await prisma.notificacion.createMany({
      data: uniqueIds.map((usuarioId) => ({
        usuarioId,
        tipo,
        titulo,
        cuerpo,
        tareaId: tareaId ?? null,
      })),
    });
  } catch (error) {
    await registrarError("NOTIF_PERSIST_FAIL", null, error);
    return;
  }

  try {
    const io = getIO();
    for (const id of uniqueIds) {
      io.to(`user_${id}`).emit("notificacion_recibida", {
        tipo,
        titulo,
        mensaje: cuerpo,
        tareaId: tareaId ?? null,
      });
    }
  } catch (_) {
    // Degradación silenciosa: no bloquear si Socket.io no está disponible
  }
};