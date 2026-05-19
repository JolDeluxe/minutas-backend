/**
 * Constantes de select de usuario reutilizables.
 * Garantizan consistencia en los includes entre todos los endpoints.
 */

export const USUARIO_SELECT_BASICO = {
  id: true,
  nombre: true,
  username: true,
  imagen: true,
  rol: true,
  departamento: true,
  linea: true,
} as const;

export const USUARIO_SELECT_MINIMO = {
  id: true,
  nombre: true,
  username: true,
} as const;
