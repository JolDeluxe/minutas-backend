import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarAccion, registrarError } from "../../utils/logger";
import { USUARIO_SELECT_BASICO } from "../shared-selects";
import type { UpdateMinutaInput, MinutaIdParams } from "./zod";

export const editarMinuta = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { id } = req.params as unknown as MinutaIdParams;
    const { titulo, lineaDefault, fechaProgramada, departamento } = req.body as UpdateMinutaInput;

    const minuta = await prisma.minuta.findUnique({
      where: { id },
    });

    if (!minuta) {
      return res.status(404).json({ error: "Minuta no encontrada" });
    }

    if (req.user!.rol !== "ADMIN" && req.user!.departamento && minuta.departamento !== req.user!.departamento) {
      return res.status(403).json({ error: "No tienes permiso para acceder a esta minuta." });
    }

    if (minuta.estado === "CANCELADA") {
      return res.status(400).json({ error: "No se puede editar una minuta cancelada." });
    }

    const data: any = {};
    if (titulo !== undefined) data.titulo = titulo;
    if (lineaDefault !== undefined) data.lineaDefault = lineaDefault;
    if (fechaProgramada !== undefined) data.fechaProgramada = new Date(fechaProgramada);
    if (departamento !== undefined) data.departamento = departamento;

    const minutaActualizada = await prisma.minuta.update({
      where: { id },
      data,
      include: {
        creadoPor: { select: USUARIO_SELECT_BASICO },
        _count:    { select: { tareas: true, notasGenerales: true } },
      },
    });

    await registrarAccion("EDITAR_MINUTA", usuarioId, `Minuta: "${minutaActualizada.titulo}"`);

    return res.status(200).json({ status: "success", data: minutaActualizada });
  } catch (error) {
    await registrarError("EDITAR_MINUTA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al editar minuta" });
  }
};
