import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarAccion, registrarError } from "../../utils/logger";
import type { MinutaIdParams } from "./zod";

export const cancelarMinuta = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { id } = req.params as unknown as MinutaIdParams;

    const minuta = await prisma.minuta.findUnique({
      where: { id },
      include: {
        creadoPor: { select: { departamento: true } },
        tareas: {
          select: { tipo: true, estado: true }
        }
      }
    });

    if (!minuta) {
      return res.status(404).json({ error: "Minuta no encontrada" });
    }

    if (req.user!.rol !== "ADMIN" && req.user!.departamento && minuta.departamento !== req.user!.departamento) {
      return res.status(403).json({ error: "No tienes permiso para acceder a esta minuta." });
    }

    if (minuta.estado === "CANCELADA") {
      return res.status(400).json({ error: "La minuta ya está cancelada" });
    }

    // Verificar tareas activas (únicamente tareas en PENDIENTE o EN_REVISION)
    const tareasActivas = minuta.tareas.filter((t: any) => {
      return t.tipo === "TAREA" && (t.estado === "PENDIENTE" || t.estado === "EN_REVISION");
    });
    
    if (tareasActivas.length > 0) {
      return res.status(400).json({ 
        error: "No se puede cancelar una minuta con tareas activas o pendientes de descartar. Descarte las tareas primero." 
      });
    }

    const updated = await prisma.minuta.update({
      where: { id },
      data: {
        estado: "CANCELADA",
        canceladoPorId: usuarioId,
        canceladoAt: new Date()
      }
    });

    await registrarAccion("CANCELAR_MINUTA", usuarioId, `Minuta: "${minuta.titulo}"`);

    return res.status(200).json({ status: "success", data: updated });
  } catch (error) {
    await registrarError("CANCELAR_MINUTA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al cancelar minuta" });
  }
};
