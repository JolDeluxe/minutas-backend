import { prisma } from "../../db";
import { TipoNotificacion } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import { getIO } from "../../utils/socket";
import webpush from "web-push";
import { env } from "../../env";

// Inicializar web-push
webpush.setVapidDetails(
  env.VAPID_SUBJECT,
  env.VAPID_PUBLIC_KEY,
  env.VAPID_PRIVATE_KEY
);

/**
 * Persiste notificaciones en BD, las emite en tiempo real por Socket.io
 * y envía notificaciones Push a los dispositivos suscritos.
 */
export const persistirYEmitir = async (
  usuarioIds: number[],
  tipo: TipoNotificacion,
  titulo: string,
  cuerpo: string,
  tareaId?: number,
  actionUrl?: string
): Promise<void> => {
  const uniqueIds = [...new Set(usuarioIds)].filter((id) => id > 0);
  if (uniqueIds.length === 0) return;

  // 1. Persistir en la BD
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

  // 2. Emitir por Socket.io (tiempo real)
  try {
    const io = getIO();
    for (const id of uniqueIds) {
      io.to(`user_${id}`).emit("notificacion_recibida", {
        tipo,
        titulo,
        mensaje: cuerpo,
        tareaId: tareaId ?? null,
        actionUrl: actionUrl ?? null,
      });
    }
  } catch (_) {
    // Degradación silenciosa: no bloquear si Socket.io no está disponible
  }

  // 3. Web Push Notifications
  try {
    const suscripciones = await prisma.pushSubscription.findMany({
      where: { usuarioId: { in: uniqueIds } },
    });

    if (suscripciones.length > 0) {
      const payload = JSON.stringify({
        title: titulo,
        body: cuerpo,
        url: actionUrl ?? "/",
      });

      const promises = suscripciones.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, payload);
          // Actualizar último éxito
          await prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { lastSuccess: new Date(), failureCount: 0 },
          });
        } catch (error: any) {
          // Limpieza de suscripciones obsoletas (Gone / Not Found)
          if (error.statusCode === 404 || error.statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          } else {
            await prisma.pushSubscription.update({
              where: { id: sub.id },
              data: { failureCount: { increment: 1 } },
            });
          }
        }
      });

      await Promise.allSettled(promises);
    }
  } catch (error) {
    await registrarError("NOTIF_PUSH_FAIL", null, error);
  }
};