import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { deleteImageByPublicId } from "../../utils/cloudinary";
import type { DeleteTareaParams } from "./zod";

/**
 * Realiza una eliminación física (Hard Delete) del registro.
 * Solo permitido para roles de GERENCIA y JEFE.
 * Coordinadores y otros roles tienen el acceso denegado.
 */
export const deleteTarea = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const rolUsuario = req.user!.rol;
    const { id } = req.params as unknown as DeleteTareaParams;

    // Filtro de seguridad por Rol: Excluye Coordinadores
    const rolesPermitidos: Rol[] = [Rol.GERENCIA, Rol.JEFE];
    if (!rolesPermitidos.includes(rolUsuario)) {
      return res.status(403).json({ 
        error: "Acceso denegado: No tienes permisos suficientes para eliminar registros físicos" 
      });
    }

    const tarea = await prisma.tarea.findUnique({
      where: { id },
      include: { imagenes: true },
    });

    if (!tarea) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    // Limpieza de infraestructura externa (Cloudinary)
    // Se ejecuta de forma asíncrona sin bloquear la respuesta
    for (const img of tarea.imagenes) {
      deleteImageByPublicId(img.publicId).catch(err => 
        console.error(`Error eliminando imagen ${img.publicId} de Cloudinary:`, err)
      );
    }

    // Eliminación atómica y registro en bitácora técnica
    await prisma.tarea.delete({ where: { id } });

    await registrarAccion("HARD_DELETE_TAREA", usuarioId, `Tarea ID ${id} destruida por ${rolUsuario}`);

    return res.json({ 
      status: "success", 
      message: "Registro destruido y auditado correctamente" 
    });
  } catch (error) {
    await registrarError("HARD_DELETE_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error interno al procesar la eliminación de la tarea" });
  }
};