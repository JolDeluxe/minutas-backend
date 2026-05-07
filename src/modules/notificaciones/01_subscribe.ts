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
    await prisma.pushSubscription.upsert({
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

    await registrarAccion(
      "SUSCRIPCION_PUSH",
      usuarioId,
      `Dispositivo registrado. Endpoint: ${endpoint.substring(0, 30)}...`
    );

    return res.status(201).json({
      success: true,
      message: "Suscripción activada correctamente",
    });
  } catch (error) {
    await registrarError("SUSCRIPCION_PUSH_FAIL", usuarioId, error);
    return res.status(500).json({
      success: false,
      message: "Error interno al suscribir dispositivo",
    });
  }
};