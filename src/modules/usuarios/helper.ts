import { Rol, Estatus, Area, Linea, Prisma } from "@prisma/client";
import type { ListUsuariosQuery } from "./zod";

export const getSecurityFilters = (
  usuario: { id: number; rol: Rol }
): Prisma.UsuarioWhereInput | null => {
  switch (usuario.rol) {
    case Rol.GERENCIA:
    case Rol.JEFE:
      return {};
    default:
      return null;
  }
};

export const validarReglasCreacion = (
  solicitante: { rol: Rol },
  rolNuevo: Rol
): void => {
  if (solicitante.rol !== Rol.GERENCIA)
    throw new Error("Solo GERENCIA puede crear usuarios.");
  if (rolNuevo === Rol.GERENCIA)
    throw new Error("Los usuarios GERENCIA deben ser creados por el administrador técnico.");
};

export const validarReglasEdicion = (
  solicitante: { id: number; rol: Rol },
  objetivo: { id: number; rol: Rol }
): void => {
  if (solicitante.id === objetivo.id) return;
  if (solicitante.rol !== Rol.GERENCIA)
    throw new Error("No tienes permisos para editar este usuario.");
  if (objetivo.rol === Rol.GERENCIA)
    throw new Error("No puedes modificar un usuario con rol GERENCIA.");
};

export const validarReglasDesactivacion = (
  solicitante: { id: number; rol: Rol },
  objetivo: { id: number; rol: Rol }
): void => {
  if (solicitante.id === objetivo.id)
    throw new Error("No puedes desactivar tu propia cuenta.");
  if (solicitante.rol !== Rol.GERENCIA)
    throw new Error("Solo GERENCIA puede cambiar el estatus de usuarios.");
  if (objetivo.rol === Rol.GERENCIA)
    throw new Error("No puedes desactivar un usuario con rol GERENCIA.");
};

/**
 * Construye dinámicamente la cláusula `where` de Prisma para el listado de usuarios.
 * Combina el filtro de seguridad por rol con todos los filtros de consulta.
 * Omite cualquier campo cuyo valor sea nulo o indefinido.
 */
export const buildUsuariosWhere = (
  query: ListUsuariosQuery,
  securityFilter: Prisma.UsuarioWhereInput
): Prisma.UsuarioWhereInput => {
  const where: Prisma.UsuarioWhereInput = { ...securityFilter };

  where.estado = query.estado ? (query.estado as Estatus) : Estatus.ACTIVO;

  if (query.q) {
    where.OR = [
      { nombre:   { contains: query.q } },
      { username: { contains: query.q } },
    ];
  }

  if (query.rol?.length)   where.rol   = { in: query.rol   as Rol[]   };
  if (query.area?.length)  where.area  = { in: query.area  as Area[]  };
  if (query.linea?.length) where.linea = { in: query.linea as Linea[] };

  if (query.createdDesde || query.createdHasta) {
    const f: { gte?: Date; lte?: Date } = {};
    if (query.createdDesde) f.gte = new Date(query.createdDesde);
    if (query.createdHasta) f.lte = new Date(query.createdHasta);
    where.createdAt = f;
  }

  return where;
};