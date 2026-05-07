import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { deleteImageByPublicId } from "../../utils/cloudinary";
import type { DeleteTareaParams } from "./zod";

export const deleteTarea = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const rolUsuario = req.user!.rol;    
    const { id } = req.params as unknown as DeleteTareaParams;

    const rolesPermitidos: Rol[] = [Rol.GERENCIA, Rol.JEFE];
    if (!rolesPermitidos.includes(rolUsuario)) {
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

    await registrarAccion("HARD_DELETE_TAREA", usuarioId, `Eliminación física. Tarea ID ${id}`);

    return res.json({ status: "success", message: "Registro destruido y auditado correctamente" });
  } catch (error) {
    await registrarError("HARD_DELETE_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error interno al eliminar la tarea" });
  }
};