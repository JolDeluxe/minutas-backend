import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol } from "@prisma/client";
import { registrarError } from "../../utils/logger";
import type { ListTareasQuery } from "./zod";

export const listTareas = async (req: Request, res: Response) => {
  try {
    // CORRECCIÓN ERRORES 2 y 3: Le decimos a TS que confíe en nosotros (any)
    // porque sabemos que el usuario en BD sí tiene 'linea'
    const usuario = req.user as any;

    // CORRECCIÓN ERROR 1: Usamos "unknown" como puente para convertir de ParsedQs a nuestra interfaz Zod
    const { 
      page, limit, estado, area, linea, 
      minutaId, isExternalArea, capturaCompleta, q 
    } = req.query as unknown as ListTareasQuery;

    const skip = (page - 1) * limit;
    const where: any = {};

    // 1. Aplicar filtros explícitos enviados por el Frontend
    if (estado) where.estado = estado;
    if (area) where.area = area;
    if (linea) where.linea = linea;
    if (minutaId) where.minutaId = minutaId;
    if (isExternalArea !== undefined) where.isExternalArea = isExternalArea;
    if (capturaCompleta !== undefined) where.capturaCompleta = capturaCompleta;
    if (q) {
      where.descripcion = { contains: q }; // Búsqueda por texto
    }

    // 2. REGLAS DE NEGOCIO Y ACCESO (Jerarquía de Diseño)
    if (usuario.rol === Rol.COORDINADOR) {
      // Regla: Rango más bajo SOLO ve las tareas donde está explícitamente asignado
      where.asignaciones = {
        some: { usuarioId: usuario.id }
      };
    } 
    else if (usuario.rol === Rol.JEFE) {
      // Regla: El Jefe ve SU bandeja de línea (para repartir), o tareas donde esté asignado,
      // o tareas externas (para poder verlas, generar el PDF y mandarlo).
      const condicionesJefe = [];
      
      // Ya no marcará error gracias al as any
      if (usuario.linea) {
        condicionesJefe.push({ linea: usuario.linea });
      }
      condicionesJefe.push({ asignaciones: { some: { usuarioId: usuario.id } } });
      condicionesJefe.push({ isExternalArea: true });

      // Se inyecta la restricción usando AND para no chocar con los filtros del frontend
      where.AND = [
        ...(where.AND || []),
        { OR: condicionesJefe }
      ];
    }
    // Si es Rol.GERENCIA, no se aplica ningún filtro restrictivo (Ve todo)

    // 3. Ejecutar consulta
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
          creadoPor: { select: { id: true, nombre: true } }
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