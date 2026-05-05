import { Rol } from "@prisma/client";
import { Prisma } from "@prisma/client";

// Devuelve el filtro WHERE según el rol del solicitante
// GERENCIA/JEFE → todos los usuarios
// COORDINADOR → solo sí mismo (null = acceso denegado a listado)
export const getSecurityFilters = (
  usuario: { id: number; rol: Rol }
): Prisma.UsuarioWhereInput | null => {
  switch (usuario.rol) {
    case Rol.GERENCIA:
    case Rol.JEFE:
      return {};
    case Rol.COORDINADOR:
      return null;
    default:
      return null;
  }
};

export const validarReglasCreacion = (
  solicitante: { rol: Rol },
  rolNuevo: Rol
) => {
  if (solicitante.rol !== Rol.GERENCIA) {
    throw new Error("Solo GERENCIA puede crear usuarios.");
  }

  // GERENCIA no puede crear otro GERENCIA desde la app — eso lo hace el admin técnico
  if (rolNuevo === Rol.GERENCIA) {
    throw new Error("Los usuarios GERENCIA deben ser creados por el administrador técnico.");
  }
};

export const validarReglasEdicion = (
  solicitante: { id: number; rol: Rol },
  objetivo: { id: number; rol: Rol }
) => {
  const esMismoUsuario = solicitante.id === objetivo.id;

  // Cualquier usuario puede editar su propio perfil (campos limitados en el handler)
  if (esMismoUsuario) return;

  // Solo GERENCIA puede editar otros usuarios
  if (solicitante.rol !== Rol.GERENCIA) {
    throw new Error("No tienes permisos para editar este usuario.");
  }

  // GERENCIA no puede editar a otro GERENCIA
  if (objetivo.rol === Rol.GERENCIA) {
    throw new Error("No puedes modificar un usuario con rol GERENCIA.");
  }
};

export const validarReglasDesactivacion = (
  solicitante: { id: number; rol: Rol },
  objetivo: { id: number; rol: Rol }
) => {
  if (solicitante.id === objetivo.id) {
    throw new Error("No puedes desactivar tu propia cuenta.");
  }

  if (solicitante.rol !== Rol.GERENCIA) {
    throw new Error("Solo GERENCIA puede cambiar el estatus de usuarios.");
  }

  if (objetivo.rol === Rol.GERENCIA) {
    throw new Error("No puedes desactivar un usuario con rol GERENCIA.");
  }
};