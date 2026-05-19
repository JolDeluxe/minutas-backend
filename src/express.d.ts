import { Rol, Area, Linea, Departamento } from "@prisma/client";

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
        linea?: Linea | null; 
      };
    }
  }
}

export {};