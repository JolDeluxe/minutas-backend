// minutas-backend/src/modules/minutas_externas/02_create.ts
import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarAccion, registrarError } from "../../utils/logger";
import { USUARIO_SELECT_BASICO } from "../shared-selects";
import type { CreateMinutaExternaInput } from "./zod";
import { getIdempotencyKey, markIdempotencyCompletedTx } from "../../middlewares/idempotency";

export const crearMinutaExterna = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { tema, area, departamento, objetivo, integrantes, asistentes, fechaProgramada } = req.body as CreateMinutaExternaInput;

    const idempotencyKey = getIdempotencyKey(res);

    const minuta = await prisma.$transaction(async (tx) => {
      const created = await tx.minutaExterna.create({
        data: {
          tema,
          area,
          departamento: departamento || null,
          objetivo: objetivo || null,
          integrantes: integrantes || null,
          asistentes: asistentes || null,
          fechaProgramada: fechaProgramada ? new Date(fechaProgramada) : null,
          creadoPorId: usuarioId,
        },
        include: {
          creadoPor: { select: USUARIO_SELECT_BASICO },
          _count: { select: { tareas: true } },
        },
      });

      const responsePayload = { status: "success", data: created };

      if (idempotencyKey) {
        await markIdempotencyCompletedTx(tx, idempotencyKey, 201, responsePayload);
      }

      return created;
    });

    await registrarAccion("CREAR_MINUTA_EXTERNA", usuarioId, `MinutaExterna: "${tema}"`);

    return res.status(201).json({ status: "success", data: minuta });
  } catch (error) {
    await registrarError("CREAR_MINUTA_EXTERNA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al crear minuta externa" });
  }
};
