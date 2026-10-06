import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { prisma } from "../db";

// Timeout tras el cual una clave en estado PROCESSING se considera abandonada (ej. caída de PM2)
const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutos

export const computePayloadHash = (body: any): string => {
  const normalized = body ? JSON.stringify(body) : "";
  return crypto.createHash("sha256").update(normalized).digest("hex");
};

export const getIdempotencyKey = (res: Response): string | undefined => {
  return res.locals?.idempotencyKey;
};

/**
 * Helper para actualizar la clave de idempotencia a COMPLETED dentro de una transacción.
 */
export const markIdempotencyCompletedTx = async (
  tx: any,
  key: string | undefined,
  statusCode: number,
  responseBody: any
) => {
  if (!key) return;
  const serialized = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
  await tx.idempotencyKey.update({
    where: { key },
    data: {
      status: "COMPLETED",
      statusCode,
      response: serialized,
    },
  });
};

/**
 * Middleware de Idempotencia basado en MySQL.
 * Si se incluye el encabezado X-Idempotency-Key:
 * - Inserta atómicamente la clave con estado PROCESSING.
 * - Si ya existe en PROCESSING: retorna 409 Conflict (rechaza concurrencia y no reejecuta ciega de keys huérfanas).
 * - Si ya existe en COMPLETED: retorna el statusCode y payload cacheados sin ejecutar la lógica.
 * - Pasa cleanKey a res.locals.idempotencyKey para que el controlador lo confirme dentro de su $transaction.
 * - Si el controlador falla (status >= 400), intercepta para registrar FAILED y liberar reintentos limpios si procede.
 */
export const idempotency = (req: Request, res: Response, next: NextFunction) => {
  const keyHeader = req.headers["x-idempotency-key"];
  const idempotencyKey = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;

  // Si el cliente no envió la cabecera, la petición prosigue sin bloqueo de idempotencia
  if (!idempotencyKey || typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return next();
  }

  const cleanKey = idempotencyKey.trim().substring(0, 64);
  const usuarioId = req.user?.id;

  if (!usuarioId) {
    return res.status(401).json({ message: "Sesión inválida para validar idempotencia" });
  }

  const targetPath = req.originalUrl.split("?")[0] || req.path;
  const method = req.method.toUpperCase();
  const paramsHash = computePayloadHash(req.body);

  (async () => {
    try {
      let record;

      // 1. Intentar registrar de forma atómica la clave en estado PROCESSING
      try {
        record = await prisma.idempotencyKey.create({
          data: {
            key: cleanKey,
            targetPath,
            method,
            paramsHash,
            usuarioId,
            status: "PROCESSING",
            lockedAt: new Date(),
          },
        });
      } catch (insertError: any) {
        if (insertError?.code === "P2002") {
          // La clave ya existe en MySQL
          record = await prisma.idempotencyKey.findUnique({
            where: { key: cleanKey },
          });
        } else {
          throw insertError;
        }
      }

      if (!record) {
        return res.status(500).json({ error: "Error de inicialización de clave de idempotencia" });
      }

      // 2. Validar contexto: la clave no puede usarse para un usuario, método o endpoint distinto, ni con payload distinto
      if (
        record.usuarioId !== usuarioId ||
        record.targetPath !== targetPath ||
        record.method !== method ||
        record.paramsHash !== paramsHash
      ) {
        return res.status(422).json({
          error: "Idempotency key reuse: la clave fue enviada previamente con diferentes parámetros o contexto.",
        });
      }

      // 3. Evaluar estado de la clave existente
      if (record.status === "COMPLETED" && record.statusCode) {
        // Devolver exactamente la respuesta original guardada
        let parsedData = record.response;
        try {
          if (record.response) parsedData = JSON.parse(record.response);
        } catch (_) {}

        res.setHeader("X-Idempotency-Replay", "true");
        return res.status(record.statusCode).json(parsedData);
      }

      if (record.status === "PROCESSING") {
        // Si la clave ya existía previamente en PROCESSING:
        // No ejecutar una segunda operación a ciegas bajo ninguna circunstancia.
        // Si el proceso previo murió o sigue corriendo, responder 409 para proteger la integridad.
        return res.status(409).json({
          error: "Operación en proceso o interrumpida previamente. No se permite duplicar la ejecución.",
          code: "IDEMPOTENT_OPERATION_IN_PROGRESS",
        });
      }

      // Si estaba en FAILED (un intento previo falló con error de validación/negocio): permitir reintento seguro
      await prisma.idempotencyKey.update({
        where: { key: cleanKey },
        data: {
          status: "PROCESSING",
          lockedAt: new Date(),
          statusCode: null,
          response: null,
        },
      });

      // Adjuntar la clave validada en res.locals para que el controlador la cierre dentro de su $transaction
      res.locals.idempotencyKey = cleanKey;

      // 4. Interceptar res.json y res.send como fallback (por ejemplo ante errores 4xx/5xx fuera de transacción)
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = function (body: any) {
        const statusCode = res.statusCode || 200;
        // Si es un error (>= 400), marcar FAILED para no dejar la clave en PROCESSING huérfana
        if (statusCode >= 400) {
          prisma.idempotencyKey
            .update({
              where: { key: cleanKey },
              data: {
                status: "FAILED",
                statusCode,
                response: JSON.stringify(body),
              },
            })
            .catch((e) => console.error("[Idempotency] Error marcando FAILED:", e));
        } else {
          // Fallback por si algún endpoint de éxito no usó markIdempotencyCompletedTx
          prisma.idempotencyKey
            .updateMany({
              where: { key: cleanKey, status: "PROCESSING" },
              data: {
                status: "COMPLETED",
                statusCode,
                response: JSON.stringify(body),
              },
            })
            .catch((e) => console.error("[Idempotency] Error en fallback COMPLETED:", e));
        }

        return originalJson(body);
      };

      res.send = function (body: any) {
        const statusCode = res.statusCode || 200;
        let serialized = "";
        try {
          serialized = typeof body === "string" ? body : JSON.stringify(body);
        } catch (_) {}

        if (statusCode >= 400) {
          prisma.idempotencyKey
            .update({
              where: { key: cleanKey },
              data: {
                status: "FAILED",
                statusCode,
                response: serialized,
              },
            })
            .catch((e) => console.error("[Idempotency] Error marcando FAILED (send):", e));
        } else {
          prisma.idempotencyKey
            .updateMany({
              where: { key: cleanKey, status: "PROCESSING" },
              data: {
                status: "COMPLETED",
                statusCode,
                response: serialized,
              },
            })
            .catch((e) => console.error("[Idempotency] Error en fallback COMPLETED (send):", e));
        }

        return originalSend(body);
      };

      return next();
    } catch (err) {
      console.error("[Idempotency Middleware] Fallo crítico:", err);
      return next();
    }
  })();
};
