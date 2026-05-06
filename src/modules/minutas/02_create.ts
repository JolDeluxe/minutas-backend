import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Linea } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import type { CreateMinutaInput } from "./zod";

export const crearMinuta = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { titulo, lineaDefault } = req.body as CreateMinutaInput;

    const minuta = await prisma.minuta.create({
      data: {
        titulo,
        lineaDefault: lineaDefault as Linea,
        creadoPorId:  usuarioId,
      },
      include: {
        // Se agrega area y linea para identificar el departamento del creador en la respuesta inmediata
        creadoPor: { select: { id: true, nombre: true, username: true, imagen: true, area: true, linea: true } },
        _count:    { select: { tareas: true } },
      },
    });

    await registrarAccion("CREAR_MINUTA", usuarioId, `Minuta: "${titulo}"`);

    return res.status(201).json({ status: "success", data: minuta });
  } catch (error) {
    await registrarError("CREAR_MINUTA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al crear minuta" });
  }
};