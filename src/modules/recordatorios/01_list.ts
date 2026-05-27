import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Area, Prisma, TipoEntrada, Rol, AlcanceRecordatorio, Departamento } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import { USUARIO_SELECT_BASICO } from "../shared-selects";

export const listRecordatorios = async (req: Request, res: Response) => {
  try {
    const usuario = req.user!;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const page = Number(req.query.page) || 1;
    const offset = (page - 1) * limit;

    const where: Prisma.TareaWhereInput = {
      tipo: TipoEntrada.RECORDATORIO,
    };

    // Aislamiento departamental general
    if (usuario.rol !== Rol.ADMIN && usuario.departamento) {
      where.departamento = usuario.departamento;
    }

    if (usuario.rol === Rol.ADMIN && req.query.departamento) {
      where.departamento = req.query.departamento as Departamento;
    }

    if (req.query.responsableId) {
      const responsableId =
        usuario.rol === Rol.ADMIN ? Number(req.query.responsableId) : usuario.id;

      where.asignaciones = { some: { usuarioId: responsableId } };
    } else if (usuario.rol === Rol.COORDINADOR) {
      where.OR = [
        { asignaciones: { some: { usuarioId: usuario.id } } }, // "Mis recordatorios"
        { alcanceRecordatorio: AlcanceRecordatorio.DEPARTAMENTO } // "De mi departamento"
      ];
    }

    if (req.query.q) {
      where.descripcion = { contains: String(req.query.q) };
    }

    if (req.query.area && req.query.area !== "TODOS") {
      where.area = req.query.area as Area;
    }

    if (req.query.linea && req.query.linea !== "TODOS") {
      where.linea = String(req.query.linea);
    }

    if (req.query.alcanceRecordatorio && req.query.alcanceRecordatorio !== "TODOS") {
      where.alcanceRecordatorio = req.query.alcanceRecordatorio as AlcanceRecordatorio;
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
             select: { id: true, titulo: true, fechaProgramada: true, fechaRealizada: true, estado: true }
          },
          imagenes: { orderBy: { orden: "asc" } },
          notas: {
            orderBy: { createdAt: "desc" },
            include: { creadoPor: { select: { id: true, nombre: true, imagen: true } } },
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
