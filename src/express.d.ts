import { Rol } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        nombre: string; 
        email: string;
        rol: Rol;
      };
    }
  }
}

export {};