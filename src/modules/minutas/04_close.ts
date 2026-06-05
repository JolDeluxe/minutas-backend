import type { Request, Response } from "express";
import { prisma } from "../../db";
import { EstadoMinuta, EstadoTarea, TipoEntrada } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import type { MinutaIdParams } from "./zod";
import { transitionMinutaStatus } from "./domain/minuta-transitions";

export const cerrarMinuta = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { id } = req.params as unknown as MinutaIdParams;

    const minuta = await prisma.minuta.findUnique({
      where: { id },
      include: { creadoPor: { select: { departamento: true } } },
    });

    if (!minuta) {
      return res.status(404).json({ error: "Minuta no encontrada" });

    }

    if (req.user!.rol !== "ADMIN" && req.user!.departamento && minuta.departamento !== req.user!.departamento) {
      return res.status(403).json({ error: "No tienes permiso para acceder a esta minuta." });
    }

    if (minuta.estado === EstadoMinuta.CERRADA) {
      return res.json({
        status: "success",
        data: minuta,
        message: "La minuta ya se encontraba cerrada previamente",
      });
    }

    // Validar que no existan tareas sin organizar (borradores o capturas pendientes)
    const hasUnorganized = await prisma.tarea.count({
      where: {
        minutaId: id,
        tipo: TipoEntrada.SIN_ORGANIZAR,
      },
    });

    if (hasUnorganized > 0) {
      return res.status(400).json({
        error: "No se puede cerrar la minuta porque aún existen tareas sin organizar (borradores o capturas pendientes de clasificar).",
      });
    }

    await transitionMinutaStatus(id, EstadoMinuta.CERRADA, usuarioId);

    // Advertencia informativa sobre entradas pendientes
    const entradasPendientes = await prisma.tarea.count({
      where: {
        minutaId: id,
        OR: [{ estado: { notIn: [EstadoTarea.CERRADA, EstadoTarea.CANCELADA] } }, { estado: null }],
      },
    });

    await registrarAccion("CERRAR_MINUTA", usuarioId, `Minuta ID: ${id}`);

    const minutaActualizada = await prisma.minuta.findUnique({ where: { id } });

    return res.json({
      status: "success",
      data: minutaActualizada,
      message: "Minuta cerrada correctamente",
      advertencia: entradasPendientes > 0
        ? `Existen ${entradasPendientes} entradas organizacionales sin cerrar/completar`
        : undefined,
    });
  } catch (error) {
    await registrarError("CERRAR_MINUTA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al cerrar la minuta" });
  }
};
