import { type Request, type Response, type NextFunction } from "express";
import { ZodError, type ZodTypeAny } from "zod";

/**
 * Middleware de validación centralizado e inteligente para Express, compatible con Bun.
 * Valida selectivamente las partes de la petición (body, query, params) y utiliza 
 * Object.defineProperty para sobreescribir las propiedades que puedan ser de solo lectura.
 */
export const validate = (schema: any) => (req: Request, res: Response, next: NextFunction) => {
  try {
    const internalSchema = schema as any;

    // Validar 'body' solo si el esquema lo define
    if (internalSchema.shape?.body) {
      const parsedBody = internalSchema.shape.body.parse(req.body);
      Object.defineProperty(req, 'body', {
        value: parsedBody,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }

    // Validar 'query' solo si el esquema lo define
    if (internalSchema.shape?.query) {
      const parsedQuery = internalSchema.shape.query.parse(req.query);
      // IMPORTANTE: En entornos como Bun/Express, req.query puede ser readonly.
      // Usamos defineProperty para forzar la inyección de los tipos correctos (Int, Arrays, etc).
      Object.defineProperty(req, 'query', {
        value: parsedQuery,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }

    // Validar 'params' solo si el esquema lo define
    if (internalSchema.shape?.params) {
      const parsedParams = internalSchema.shape.params.parse(req.params);
      Object.defineProperty(req, 'params', {
        value: parsedParams,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }

    return next();
  } catch (error: any) {
    if (error instanceof ZodError) {
      console.log("❌ Error de Validación Zod:", JSON.stringify(error.format(), null, 2));
      return res.status(400).json({
        status: "error",
        message: "Datos de entrada inválidos",
        errors: error.issues.map((issue: any) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    // Fallback para errores inesperados
    console.error("🔥 Error Crítico en Middleware de Validación:", error);
    return res.status(500).json({
      error: "Error interno durante la validación de la solicitud",
    });
  }
};
