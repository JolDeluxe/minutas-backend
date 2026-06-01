import type { Request, Response } from "express";
import { prisma } from "../../db";
import { EstadoMinuta } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import type { MinutaIdParams } from "./zod";
import { transitionMinutaStatus } from "./domain/minuta-transitions";

export const reabrirMinuta = async (req: Request, res: Response) => {
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

    if (minuta.estado !== EstadoMinuta.EN_ORGANIZACION && minuta.estado !== EstadoMinuta.ACTIVA && minuta.estado !== EstadoMinuta.CERRADA) {
      return res.status(400).json({ error: "Solo se pueden reabrir minutas que estén en Organización, Activas o Cerradas." });
    }

    // Al reabrir, regresamos a EN_CURSO para que puedan agregar entradas
    await transitionMinutaStatus(id, EstadoMinuta.EN_CURSO, usuarioId);

    const minutaActualizada = await prisma.minuta.findUnique({ where: { id } });

    await registrarAccion("REABRIR_MINUTA", usuarioId, `Minuta ID: ${id}`);

    return res.json({
      status: "success",
      data: minutaActualizada,
      message: "Sesión reabierta correctamente",
    });
  } catch (error) {
    await registrarError("REABRIR_MINUTA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al reabrir la minuta" });
  }
};
