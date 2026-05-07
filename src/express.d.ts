import { Rol, Area, Linea } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        nombre: string; 
        email: string;
        rol: Rol;
        area: Area; 
        linea?: Linea | null; 
      };
    }
  }
}

export {};