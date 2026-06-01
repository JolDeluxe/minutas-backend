// minutas-backend/src/modules/tareas/11_toggle-notificado.ts
// Solo el ADMIN puede marcar/desmarcar una tarea de área externa como notificada.

import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import { registrarCambio } from "./helpers";
import type { TareaIdParams } from "./zod";

export const toggleNotificado = async (req: Request, res: Response) => {
  try {
    const rolUsuario = req.user!.rol;
    const usuarioId = req.user!.id;

    if (rolUsuario !== Rol.ADMIN) {
      return res.status(403).json({ error: "Solo el ADMIN puede marcar/desmarcar notificaciones." });
    }

    const { id } = req.params as unknown as TareaIdParams;

    const tarea = await prisma.tarea.findUnique({ where: { id } });
    if (!tarea) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    const ahora = new Date();
    const yaNotificado = tarea.notificadoAt !== null;

    const actualizada = await prisma.tarea.update({
      where: { id },
      data: { notificadoAt: yaNotificado ? null : ahora },
    });

    // Registrar en historial
    await registrarCambio(
      id,
      usuarioId,
      "notificadoAt",
      yaNotificado ? tarea.notificadoAt?.toISOString() ?? null : null,
      yaNotificado ? null : ahora.toISOString()
    );

    return res.json({
      status: "success",
      data: {
        notificadoAt: actualizada.notificadoAt,
        notificado: actualizada.notificadoAt !== null,
      },
    });
  } catch (error) {
    await registrarError("TOGGLE_NOTIFICADO", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al actualizar estado de notificación" });
  }
};
