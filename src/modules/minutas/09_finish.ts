import type { Request, Response } from "express";
import { prisma } from "../../db";
import { EstadoMinuta } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { transitionMinutaStatus } from "./domain/minuta-transitions";
import { evaluateMinutaStatus } from "./domain/evaluate-minuta-status";
import type { MinutaIdParams } from "./zod";

export const finalizarMinuta = async (req: Request, res: Response) => {
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

    if (minuta.estado !== EstadoMinuta.EN_CURSO) {
      return res.status(400).json({ error: "Solo se pueden finalizar juntas EN_CURSO" });
    }

    // Cambiamos a EN_ORGANIZACION
    await transitionMinutaStatus(id, EstadoMinuta.EN_ORGANIZACION, usuarioId);

    // Inmediatamente llamamos al evaluator para que, si no hay entradas sin organizar, 
    // decida si pasa a ACTIVA o CERRADA directamente.
    await evaluateMinutaStatus(id, usuarioId);

    const minutaFinal = await prisma.minuta.findUnique({ where: { id } });

    await registrarAccion("FINALIZAR_JUNTA", usuarioId, `Minuta ID: ${id}`);

    return res.json({
      status: "success",
      data: minutaFinal,
      message: "Junta finalizada correctamente",
    });
  } catch (error) {
    await registrarError("FINALIZAR_JUNTA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al finalizar la junta" });
  }
};
