import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol, Estatus, Prisma } from "@prisma/client";
import { getSecurityFilters } from "./helper";
import { registrarError } from "../../utils/logger";
import type { ListUsuariosQuery, GetUsuarioByIdParams } from "./zod";

const sharedSelect = {
  id: true,
  nombre: true,
  username: true,
  email: true,
  imagen: true,
  rol: true,
  estado: true,
  createdAt: true,
} satisfies Prisma.UsuarioSelect;

export const listarUsuarios = async (req: Request, res: Response) => {
  try {
    const solicitante = req.user!;
    const { q, page, limit, rol, estado, sort } = req.query as unknown as ListUsuariosQuery;

    const filtroSeguridad = getSecurityFilters(solicitante);

    if (filtroSeguridad === null) {
      return res.status(403).json({ error: "Acceso denegado." });
    }

    const targetEstatus = estado === Estatus.INACTIVO ? Estatus.INACTIVO : Estatus.ACTIVO;
    const offset = (page - 1) * limit;

    let where: Prisma.UsuarioWhereInput = {
      ...filtroSeguridad,
      estado: targetEstatus,
    };

    if (q) {
      where.OR = [
        { nombre: { contains: q } },
        { username: { contains: q } },
      ];
    }

    if (rol) where.rol = rol as Rol;

    const [total, resumenRoles, usuarios] = await Promise.all([
      prisma.usuario.count({ where }),
      prisma.usuario.groupBy({
        by: ["rol"],
        _count: { id: true },
        where: { ...filtroSeguridad, estado: targetEstatus },
      }),
      prisma.usuario.findMany({
        where,
        take: limit,
        skip: offset,
        select: sharedSelect,
        orderBy: sort as Prisma.UsuarioOrderByWithRelationInput[],
      }),
    ]);

    const resumen = resumenRoles.reduce((acc, curr) => {
      acc[curr.rol] = curr._count.id;
      return acc;
    }, {} as Record<string, number>);

    return res.json({
      status: "success",
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      resumenRoles: resumen,
      data: usuarios,
    });
  } catch (error) {
    await registrarError("LIST_USUARIOS", req.user?.id || null, error);
    return res.status(500).json({ error: "Error al obtener usuarios" });
  }
};

export const getUsuarioById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as unknown as GetUsuarioByIdParams;
    const solicitante = req.user!;

    // COORDINADOR solo puede ver su propio perfil
    if (solicitante.rol === Rol.COORDINADOR && id !== solicitante.id) {
      return res.status(403).json({ error: "Acceso denegado." });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: { ...sharedSelect, mustChangePassword: true, updatedAt: true },
    });

    if (!usuario) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    return res.json({ status: "success", data: usuario });
  } catch (error) {
    await registrarError("GET_USUARIO_ID", req.user?.id || null, error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};