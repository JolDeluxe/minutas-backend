import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { deleteImageByPublicId } from "../../utils/cloudinary";
import type { DeleteTareaParams } from "./zod";

export const deleteTarea = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = req.user!.id;
    const rolUsuario = req.user!.rol;

    const { id } =
      req.params as unknown as DeleteTareaParams;

    const rolesPermitidos: Rol[] = [
      Rol.GERENCIA,
      Rol.JEFE,
    ];

    if (!rolesPermitidos.includes(rolUsuario)) {
      return res.status(403).json({
        error:
          "No tienes permisos para eliminar registros físicamente",
      });
    }

    const tarea = await prisma.tarea.findUnique({
      where: { id },

      include: {
        imagenes: true,
      },
    });

    if (!tarea) {
      return res.status(404).json({
        error: "Entrada no encontrada",
      });
    }

    for (const img of tarea.imagenes) {
      deleteImageByPublicId(img.publicId).catch(
        (err) => {
          console.error(
            `Error eliminando imagen ${img.publicId}:`,
            err
          );
        }
      );
    }

    await prisma.tarea.delete({
      where: { id },
    });

    await registrarAccion(
      "DELETE_TAREA",
      usuarioId,
      `Entrada organizacional eliminada ID ${id}`
    );

    return res.json({
      status: "success",
      message:
        "Entrada eliminada correctamente",
    });
  } catch (error) {
    await registrarError(
      "DELETE_TAREA",
      req.user?.id ?? null,
      error
    );

    return res.status(500).json({
      error:
        "Error al eliminar la entrada",
    });
  }
};