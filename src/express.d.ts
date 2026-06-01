import { Rol, Area, Departamento } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        nombre: string; 
        email: string;
        rol: Rol;
        departamento?: Departamento | null;
        linea?: string | null; 
        lineas: string[];
      };
    }
  }
}

export {};