import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import type { CreateNotaGenInput, CreateTareaNotaInput } from "./zod";

export const createNotaGeneral = async (
  req: Request,
  res: Response
) => {
  try {
    const data = req.body as CreateNotaGenInput;
    const usuarioId = req.user!.id;

    // Verificar si existe la minuta
    const minuta = await prisma.minuta.findUnique({
      where: { id: data.minutaId },
    });

    if (!minuta) {
      return res.status(404).json({
        error: "Minuta no encontrada",
      });
    }

    const nota = await prisma.notaGeneral.create({
      data: {
        contenido: data.contenido,
        minutaId: data.minutaId,
        creadoPorId: usuarioId,
      },
      include: {
        creadoPor: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });

    return res.status(201).json({
      status: "success",
      data: nota,
    });
  } catch (error) {
    await registrarError(
      "CREAR_NOTA_GENERAL",
      req.user?.id ?? null,
      error
    );

    return res.status(500).json({
      error: "Error al crear la nota general",
    });
  }
};

export const createTareaNota = async (
  req: Request,
  res: Response
) => {
  try {
    const data = req.body as CreateTareaNotaInput;
    const usuarioId = req.user!.id;

    // Verificar si existe la tarea
    const tarea = await prisma.tarea.findUnique({
      where: { id: data.tareaId },
    });

    if (!tarea) {
      return res.status(404).json({
        error: "Entrada organizacional no encontrada",
      });
    }

    const nota = await prisma.tareaNota.create({
      data: {
        contenido: data.contenido,
        tareaId: data.tareaId,
        creadoPorId: usuarioId,
      },
      include: {
        creadoPor: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });

    return res.status(201).json({
      status: "success",
      data: nota,
    });
  } catch (error) {
    await registrarError(
      "CREAR_NOTA_TAREA",
      req.user?.id ?? null,
      error
    );

    return res.status(500).json({
      error: "Error al crear la nota de entrada",
    });
  }
};

export const updateTareaNota = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;
    const { contenido } = req.body;
    const usuarioId = req.user!.id;

    const nota = await prisma.tareaNota.findUnique({
      where: { id: Number(id) },
    });

    if (!nota) {
      return res.status(404).json({ error: "Nota no encontrada" });
    }

    const updated = await prisma.tareaNota.update({
      where: { id: Number(id) },
      data: { contenido },
    });

    return res.json({ status: "success", data: updated });
  } catch (error) {
    await registrarError("ACTUALIZAR_NOTA_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al actualizar la nota" });
  }
};

export const deleteTareaNota = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;

    await prisma.tareaNota.delete({
      where: { id: Number(id) },
    });

    return res.json({ status: "success", message: "Nota eliminada" });
  } catch (error) {
    await registrarError("ELIMINAR_NOTA_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al eliminar la nota" });
  }
};

