import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Prisma, TipoEntrada, Rol, AlcanceRecordatorio } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import { USUARIO_SELECT_BASICO } from "../shared-selects";

export const listRecordatorios = async (req: Request, res: Response) => {
  try {
    const usuario = req.user!;
    const limit = Number(req.query.limit) || 20;
    const page = Number(req.query.page) || 1;
    const offset = (page - 1) * limit;

    const where: Prisma.TareaWhereInput = {
      tipo: TipoEntrada.RECORDATORIO,
    };

    // Aislamiento departamental general
    if (usuario.rol !== Rol.ADMIN && usuario.departamento) {
      where.departamento = usuario.departamento;
    }

    // Regla de Visibilidad para Coordinador
    if (usuario.rol === Rol.COORDINADOR) {
      where.OR = [
        { asignaciones: { some: { usuarioId: usuario.id } } }, // "Mis recordatorios"
        { alcanceRecordatorio: AlcanceRecordatorio.DEPARTAMENTO } // "De mi departamento"
      ];
    } else if (req.query.responsableId) {
      where.asignaciones = { some: { usuarioId: Number(req.query.responsableId) } };
    }

    if (req.query.q) {
      where.descripcion = { contains: String(req.query.q) };
    }
    
    if (req.query.minutaId) {
        where.minutaId = Number(req.query.minutaId);
    }

    const [total, recordatorios] = await prisma.$transaction([
      prisma.tarea.count({ where }),
      prisma.tarea.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          minuta: {
             select: { id: true, titulo: true }
          },
          creadoPor: {
            select: USUARIO_SELECT_BASICO,
          },
          asignaciones: {
            include: {
              usuario: { select: USUARIO_SELECT_BASICO },
            },
          },
        },
      }),
    ]);

    return res.json({
      status: "success",
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: recordatorios,
    });
  } catch (error) {
    await registrarError("LIST_RECORDATORIOS", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al listar recordatorios" });
  }
};
