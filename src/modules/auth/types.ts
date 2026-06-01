import { Rol, Area, Departamento } from "@prisma/client";

export interface TokenPayload {
  id: number;
  username: string;
  email: string | null;
  rol: Rol;
  nombre: string;
  linea: string | null;
  lineas: string[];
  departamento: Departamento | null;
}

export interface LoginResponse {
  status: "success";
  accessToken: string;
  refreshToken: string;
  user: {
    id: number;
    nombre: string;
    username: string;
    rol: Rol;
    email?: string;
    mustChangePassword: boolean;
  };
}