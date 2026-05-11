import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Linea } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { USUARIO_SELECT_BASICO } from "../shared-selects";
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
        creadoPor: { select: USUARIO_SELECT_BASICO },
        _count:    { select: { tareas: true, notasGenerales: true } },
      },
    });

    await registrarAccion("CREAR_MINUTA", usuarioId, `Minuta: "${titulo}"`);

    return res.status(201).json({ status: "success", data: minuta });
  } catch (error) {
    await registrarError("CREAR_MINUTA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al crear minuta" });
  }
};