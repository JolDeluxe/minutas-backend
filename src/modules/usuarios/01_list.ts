import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol, Prisma } from "@prisma/client";
import { getSecurityFilters, buildUsuariosWhere } from "./helper";
import { registrarError } from "../../utils/logger";
import type { ListUsuariosQuery, GetUsuarioByIdParams } from "./zod";

const sharedSelect = {
  id:        true,
  nombre:    true,
  username:  true,
  email:     true,
  imagen:    true,
  rol:       true,
  estado:    true,
  departamento: true,
  linea:     true,
  createdAt: true,
} satisfies Prisma.UsuarioSelect;

export const listarUsuarios = async (req: Request, res: Response) => {
  try {
    const solicitante        = req.user!;
    const query              = req.query as unknown as ListUsuariosQuery;
    const { page, limit, sort } = query;

    const securityFilter = getSecurityFilters(solicitante);
    if (securityFilter === null) {
      return res.status(403).json({ error: "Acceso denegado." });
    }

    const where  = buildUsuariosWhere(query, securityFilter);
    const offset = (page - 1) * limit;

    // Construct a where clause without the role filter
    const querySinRol = { ...query };
    delete querySinRol.rol;
    const whereSinRol = buildUsuariosWhere(querySinRol, securityFilter);

    const orderBy = (sort || []) as Prisma.UsuarioOrderByWithRelationInput[];

    const [total, totalAbsoluto, resumenRoles, usuarios] = await Promise.all([
      prisma.usuario.count({ where }),
      prisma.usuario.count({ where: whereSinRol }),
      prisma.usuario.groupBy({
        by:     ["rol"],
        _count: { id: true },
        where:  whereSinRol,
      }),
      prisma.usuario.findMany({
        where,
        take:    limit,
        skip:    offset,
        select:  sharedSelect,
        orderBy,
      }),
    ]);

    const resumen = resumenRoles.reduce((acc, curr) => {
      acc[curr.rol] = curr._count.id;
      return acc;
    }, {} as Record<string, number>);

    return res.json({
      status: "success",
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      totalAbsoluto,
      resumenRoles: resumen,
      data: usuarios,
    });
  } catch (error) {
    await registrarError("LIST_USUARIOS", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al obtener usuarios" });
  }
};

export const getUsuarioById = async (req: Request, res: Response) => {
  try {
    const { id }      = req.params as unknown as GetUsuarioByIdParams;
    const solicitante = req.user!;

    if (solicitante.rol === Rol.COORDINADOR && id !== solicitante.id) {
      return res.status(403).json({ error: "Acceso denegado." });
    }

    const usuario = await prisma.usuario.findUnique({
      where:  { id },
      select: { ...sharedSelect, mustChangePassword: true, updatedAt: true },
    });

    if (!usuario) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    return res.json({ status: "success", data: usuario });
  } catch (error) {
    await registrarError("GET_USUARIO_ID", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};