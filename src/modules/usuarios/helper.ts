import { Rol, Estatus, Departamento, Prisma } from "@prisma/client";
import type { ListUsuariosQuery } from "./zod";

export const getSecurityFilters = (
  usuario: { id: number; rol: Rol; departamento?: Departamento | null }
): Prisma.UsuarioWhereInput | null => {
  if (usuario.rol === Rol.ADMIN) {
    return {};
  }
  if (usuario.rol === Rol.GERENCIA) {
    return { departamento: usuario.departamento };
  }
  return null;
};

export const validarReglasCreacion = (
  solicitante: { rol: Rol; departamento?: Departamento | null },
  usuarioNuevo: { rol: Rol; departamento?: Departamento | null }
): void => {
  if (usuarioNuevo.rol === Rol.ADMIN) {
    if (usuarioNuevo.departamento !== null && usuarioNuevo.departamento !== undefined) {
      throw new Error("Un Administrador no puede pertenecer a un departamento.");
    }
  } else {
    if (!usuarioNuevo.departamento) {
      throw new Error("Este usuario debe pertenecer a un departamento (Diseño o Marketing).");
    }
  }

  if (solicitante.rol === Rol.ADMIN) return;

  if (solicitante.rol !== Rol.GERENCIA) {
    throw new Error("Solo los administradores y gerencias pueden registrar usuarios.");
  }

  if (usuarioNuevo.rol === Rol.ADMIN || usuarioNuevo.rol === Rol.GERENCIA) {
    throw new Error("No tienes permisos para registrar usuarios con este rol.");
  }

  if (usuarioNuevo.departamento !== solicitante.departamento) {
    throw new Error("Solo puedes registrar usuarios dentro de tu propio departamento.");
  }
};

export const validarReglasEdicion = (
  solicitante: { id: number; rol: Rol; departamento?: Departamento | null },
  objetivo: { id: number; rol: Rol; departamento?: Departamento | null },
  datos?: { rol?: Rol; departamento?: Departamento | null }
): void => {
  const rolFinal = datos?.rol !== undefined ? datos.rol : objetivo.rol;
  const deptoFinal = datos?.departamento !== undefined ? datos.departamento : objetivo.departamento;

  if (rolFinal === Rol.ADMIN) {
    if (deptoFinal !== null && deptoFinal !== undefined) {
      throw new Error("Un Administrador no puede pertenecer a un departamento.");
    }
  } else {
    if (!deptoFinal) {
      throw new Error("Este usuario debe pertenecer a un departamento (Diseño o Marketing).");
    }
  }

  if (solicitante.id === objetivo.id) return;
  
  if (solicitante.rol === Rol.ADMIN) return;

  if (solicitante.rol !== Rol.GERENCIA) {
    throw new Error("Solo los administradores y gerencias pueden editar usuarios.");
  }

  if (objetivo.rol === Rol.ADMIN || objetivo.rol === Rol.GERENCIA) {
    throw new Error("No tienes permisos para editar a este usuario.");
  }

  if (deptoFinal !== solicitante.departamento) {
    throw new Error("Solo puedes editar usuarios dentro de tu propio departamento.");
  }
};

export const validarReglasDesactivacion = (
  solicitante: { id: number; rol: Rol; departamento?: Departamento | null },
  objetivo: { id: number; rol: Rol; departamento?: Departamento | null }
): void => {
  if (solicitante.id === objetivo.id) {
    throw new Error("No puedes desactivar tu propia cuenta.");
  }

  if (solicitante.rol === Rol.ADMIN) return;

  if (solicitante.rol !== Rol.GERENCIA) {
    throw new Error("Solo los administradores y gerencias pueden cambiar el estatus de usuarios.");
  }

  if (objetivo.rol === Rol.ADMIN || objetivo.rol === Rol.GERENCIA) {
    throw new Error("No tienes permisos para cambiar el estatus de este usuario.");
  }

  if (objetivo.departamento !== solicitante.departamento) {
    throw new Error("Solo puedes cambiar el estatus de usuarios de tu propio departamento.");
  }
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
  
  if (query.departamento?.length) {
    const hasGlobal = query.departamento.some(d => d === "GLOBAL" || d === "null" || !d);
    const validDeps = query.departamento.filter(d => d && d !== "GLOBAL" && d !== "null") as Departamento[];

    if (hasGlobal) {
      if (validDeps.length > 0) {
        where.OR = [
          { departamento: null },
          { departamento: { in: validDeps } }
        ];
      } else {
        where.departamento = null;
      }
    } else {
      where.departamento = { in: validDeps };
    }
  }

  if (query.linea?.length) where.linea = { in: query.linea as string[] };

  if (query.createdDesde || query.createdHasta) {
    const f: { gte?: Date; lte?: Date } = {};
    if (query.createdDesde) f.gte = new Date(query.createdDesde);
    if (query.createdHasta) f.lte = new Date(query.createdHasta);
    where.createdAt = f;
  }

  return where;
};