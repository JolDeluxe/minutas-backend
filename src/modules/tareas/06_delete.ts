import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { deleteImageByPublicId } from "../../utils/cloudinary";
import type { TareaIdParams } from "./zod";

export const deleteTarea = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { id }    = req.params as unknown as TareaIdParams;

    // Corrección del error de TS tipando el arreglo explícitamente
    const rolesPermitidos: Rol[] = [Rol.GERENCIA, Rol.JEFE];
    if (!rolesPermitidos.includes(req.user!.rol)) {
      return res.status(403).json({ error: "Solo GERENCIA o JEFE pueden eliminar tareas" });
    }

    const tarea = await prisma.tarea.findUnique({
      where: { id },
      include: { imagenes: true },
    });

    if (!tarea) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    // Limpiar imágenes de Cloudinary antes de borrar (fire and forget)
    for (const img of tarea.imagenes) {
      deleteImageByPublicId(img.publicId).catch(console.error);
    }

    await prisma.tarea.delete({ where: { id } });

    await registrarAccion("ELIMINAR_TAREA", usuarioId, `Tarea ID ${id}`);

    return res.json({ status: "success", message: "Tarea eliminada correctamente" });
  } catch (error) {
    await registrarError("ELIMINAR_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al eliminar tarea" });
  }
};