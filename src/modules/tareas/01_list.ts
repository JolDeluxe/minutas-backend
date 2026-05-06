import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import type { ListTareasQuery } from "./zod";

export const listTareas = async (req: Request, res: Response) => {
  try {
    const usuario = req.user as any;

    const { 
      page, limit, estado, area, linea, 
      minutaId, isExternalArea, capturaCompleta, q 
    } = req.query as unknown as ListTareasQuery;

    const skip = (page - 1) * limit;
    const where: any = {};

    if (estado) where.estado = estado;
    if (area) where.area = area;
    if (linea) where.linea = linea;
    if (minutaId) where.minutaId = minutaId;
    if (isExternalArea !== undefined) where.isExternalArea = isExternalArea;
    if (capturaCompleta !== undefined) where.capturaCompleta = capturaCompleta;
    if (q) {
      where.descripcion = { contains: q };
    }

    if (usuario.rol === Rol.COORDINADOR) {
      where.asignaciones = {
        some: { usuarioId: usuario.id }
      };
    } 
    else if (usuario.rol === Rol.JEFE) {
      const condicionesJefe = [];
      
      if (usuario.linea) {
        condicionesJefe.push({ linea: usuario.linea });
      }
      condicionesJefe.push({ asignaciones: { some: { usuarioId: usuario.id } } });
      condicionesJefe.push({ isExternalArea: true });

      where.AND = [
        ...(where.AND || []),
        { OR: condicionesJefe }
      ];
    }

    const [total, tareas] = await prisma.$transaction([
      prisma.tarea.count({ where }),
      prisma.tarea.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          imagenes: { orderBy: { orden: "asc" } },
          asignaciones: { 
            include: { 
              usuario: { select: { id: true, nombre: true, imagen: true } } 
            } 
          },
          minuta: { select: { id: true, titulo: true, estado: true } },
          creadoPor: { select: { id: true, nombre: true } },
          notas: true // <-- SE AGREGARON LOS ANEXOS
        }
      })
    ]);

    return res.json({
      status: "success",
      data: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        tareas
      }
    });

  } catch (error) {
    await registrarError("LISTAR_TAREAS", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al listar las tareas" });
  }
};