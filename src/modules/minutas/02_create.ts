import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarAccion, registrarError } from "../../utils/logger";
import { USUARIO_SELECT_BASICO } from "../shared-selects";
import type { CreateMinutaInput } from "./zod";

export const crearMinuta = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { titulo, lineaDefault, fechaProgramada, iniciarInmediatamente, departamento } = req.body as CreateMinutaInput & { departamento?: string };

    const data: any = {
      titulo,
      lineaDefault: lineaDefault ? (lineaDefault as string) : null,
      departamento: departamento || "DISENO",
      creadoPorId:  usuarioId,
      fechaProgramada: new Date(fechaProgramada),
    };

    if (iniciarInmediatamente) {
      data.estado = "ACTIVA";
      data.fechaRealizada = new Date();

      // Find previous
      const anterior = await prisma.minuta.findFirst({
        where: {
          lineaDefault: lineaDefault as string,
          estado: "CERRADA"
        },
        orderBy: {
          fechaRealizada: "desc"
        }
      });
      if (anterior) {
        data.minutaAnteriorId = anterior.id;
      }
    }

    const minuta = await prisma.minuta.create({
      data,
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