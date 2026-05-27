import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarAccion, registrarError } from "../../utils/logger";
import type { MinutaIdParams } from "./zod";

import { EstadoMinuta } from "@prisma/client";
import { transitionMinutaStatus } from "./domain/minuta-transitions";

export const iniciarMinuta = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { id } = req.params as unknown as MinutaIdParams;

    const minuta = await prisma.minuta.findUnique({
      where: { id },
      select: { 
        id: true, 
        estado: true, 
        departamento: true,
        lineaDefault: true, 
        titulo: true,
        creadoPor: { select: { departamento: true } }
      },
    });

    if (!minuta) {
      return res.status(404).json({ error: "Minuta no encontrada" });
    }

    if (req.user!.rol !== "ADMIN" && req.user!.departamento && minuta.departamento !== req.user!.departamento) {
      return res.status(403).json({ error: "No tienes permiso para acceder a esta minuta." });
    }

    if (minuta.estado !== EstadoMinuta.PROGRAMADA) {
      return res.status(400).json({ error: "Solo se pueden iniciar minutas PROGRAMADAS" });
    }

    // Find previous minuta
    const anterior = await prisma.minuta.findFirst({
      where: {
        lineaDefault: minuta.lineaDefault,
        estado: EstadoMinuta.CERRADA
      },
      orderBy: {
        fechaRealizada: "desc"
      }
    });

    if (anterior) {
      await prisma.minuta.update({
        where: { id },
        data: { minutaAnteriorId: anterior.id },
      });
    }

    await transitionMinutaStatus(id, EstadoMinuta.EN_CURSO, usuarioId);

    const updated = await prisma.minuta.findUnique({ where: { id } });

    await registrarAccion("INICIAR_MINUTA", usuarioId, `Minuta: "${minuta.titulo}"`);

    return res.status(200).json({ status: "success", data: updated });

    return res.status(200).json({ status: "success", data: updated });
  } catch (error) {
    await registrarError("INICIAR_MINUTA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al iniciar minuta" });
  }
};
