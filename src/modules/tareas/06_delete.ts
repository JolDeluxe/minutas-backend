import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol, EstadoTarea, EstadoMinuta, TipoEntrada } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { deleteImageByPublicId } from "../../utils/cloudinary";
import { notificarTareaDescartada } from "../notificaciones/services";
import type { DeleteTareaParams } from "./zod";
import { evaluarEstadoMinuta } from "./helpers";

/**
 * Eliminación Lógica de una Tarea/Entrada.
 * Cambia el estado a CANCELADA y borra las imágenes de Cloudinary en segundo plano.
 */
export const deleteTarea = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { id } = req.params as unknown as DeleteTareaParams;

    // 1. Buscar la tarea y sus imágenes
    const tarea = await prisma.tarea.findUnique({
      where: { id },
      include: {
        imagenes: {
          select: {
            publicId: true,
          },
        },
        minuta: {
          select: {
            estado: true,
          },
        },
      },
    });

    if (!tarea) {
      return res.status(404).json({ error: "Entrada no encontrada" });
    }

    // 2. Validar permisos
    const esCreador = tarea.creadoPorId === usuarioId;
    const esAdmin = req.user!.rol === Rol.ADMIN || req.user!.rol === Rol.GERENCIA;
    const minutaCerrada =
      tarea.minuta?.estado === EstadoMinuta.CERRADA ||
      tarea.minuta?.estado === EstadoMinuta.CANCELADA;

    if (minutaCerrada && !esAdmin) {
      return res.status(403).json({
        error: "No puedes descartar entradas de una minuta que ya fue cerrada.",
      });
    }

    if (!esCreador && !esAdmin) {
      return res.status(403).json({
        error: "No tienes permisos para descartar esta entrada.",
      });
    }

    // 3. Realizar la actualización de estado (Soft Delete)
    // Si la entrada ya estaba formalizada como TAREA, la pasamos a CANCELADA.
    // Si no, la pasamos a tipo DESCARTADA.
    const isTareaFormalizada = tarea.tipo === TipoEntrada.TAREA;

    await prisma.tarea.update({
      where: { id },
      data: {
        ...(isTareaFormalizada ? { estado: EstadoTarea.CANCELADA } : { tipo: TipoEntrada.DESCARTADA, estado: null }),
        cerradoAt: new Date(),
      },
    });

    // Reevaluar estado de la minuta al eliminar
    if (tarea.minutaId) {
      await evaluarEstadoMinuta(tarea.minutaId, usuarioId);
    }

    // 4. Responder inmediatamente a la UI
    res.status(200).json({ message: "Entrada descartada correctamente." });

    // 5. Registrar en bitácora en segundo plano (NO eliminamos imágenes porque es un soft delete)
    process.nextTick(async () => {
      try {
        await registrarAccion(
          "DESCARTAR_TAREA",
          usuarioId,
          `Entrada organizacional descartada ID ${id}`
        );
        if (isTareaFormalizada) {
          await notificarTareaDescartada(id, tarea.descripcion, usuarioId);
        }
      } catch (backgroundError) {
        await registrarError(
          "DELETE_TAREA_BACKGROUND",
          usuarioId,
          backgroundError
        );
      }
    });

  } catch (error) {
    await registrarError("DELETE_TAREA", req.user?.id ?? null, error);
    // No enviar una respuesta aquí si ya se envió una
    if (!res.headersSent) {
      return res.status(500).json({ error: "Error al descartar la entrada" });
    }
  }
};
