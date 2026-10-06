import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarAccion, registrarError } from "../../utils/logger";
import type { SubscriptionInput } from "./zod";

export const subscribe = async (req: Request, res: Response) => {
  const usuarioId = req.user?.id;

  if (!usuarioId) {
    return res.status(401).json({ message: "Sesión inválida" });
  }

  const { endpoint, keys } = req.body as SubscriptionInput;

  try {
    let subscription;
    try {
      subscription = await prisma.pushSubscription.upsert({
        where: { endpoint },
        update: {
          p256dh: keys.p256dh,
          auth: keys.auth,
          usuarioId,
          lastSuccess: new Date(),
          failureCount: 0,
        },
        create: {
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          usuarioId,
        },
      });
    } catch (upsertError: any) {
      // Prisma P2002: Unique constraint failed. Si dos requests simultáneos entraron al create,
      // el segundo chocará con la restricción PushSubscription_endpoint_key.
      const isEndpointConflict =
        upsertError?.code === "P2002" &&
        (Array.isArray(upsertError.meta?.target)
          ? upsertError.meta.target.includes("endpoint")
          : String(upsertError.meta?.target || "").includes("endpoint") ||
            String(upsertError.message || "").includes("endpoint"));

      if (isEndpointConflict) {
        // Resolver la colisión de concurrencia actualizando de forma determinista el registro existente
        subscription = await prisma.pushSubscription.update({
          where: { endpoint },
          data: {
            p256dh: keys.p256dh,
            auth: keys.auth,
            usuarioId,
            lastSuccess: new Date(),
            failureCount: 0,
          },
        });
      } else {
        throw upsertError;
      }
    }

    await registrarAccion(
      "SUSCRIPCION_PUSH",
      usuarioId,
      `Dispositivo registrado. Endpoint: ${endpoint.substring(0, 30)}...`
    );

    return res.status(201).json({
      success: true,
      message: "Suscripción activada correctamente",
      data: { id: subscription.id },
    });
  } catch (error) {
    await registrarError("SUSCRIPCION_PUSH_FAIL", usuarioId, error);
    return res.status(500).json({
      success: false,
      message: "Error interno al suscribir dispositivo",
    });
  }
};