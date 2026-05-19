// minutas-backend/src/modules/tareas/02_create.ts

import type { Request, Response } from "express";
import { prisma } from "../../db";

import {
  Area,
  Linea,
  Prioridad,
  Clasificacion,
  EstadoConceptual,
  EstadoMinuta,
  EstadoOperativo,
  EstadoTarea,
  TipoAsignacion,
  Departamento,
} from "@prisma/client";

import {
  registrarAccion,
  registrarError,
} from "../../utils/logger";

import { uploadTaskImage } from "../../utils/cloudinary";

import {
  calcularIsExternalArea,
  calcularCapturaCompleta,
  normalizarFechaVencimiento,
} from "./helpers";

import { getIO } from "../../utils/socket";

import type { CreateTareaInput } from "./zod";

export const crearTarea = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = req.user!.id;

    const tareasPayload = req.body.tareas as CreateTareaInput[];

    // ── Validar TODAS las minutas referenciadas ──────────────
    const uniqueMinutaIds = [
      ...new Set(
        tareasPayload
          .map((t) => t.minutaId)
          .filter((id): id is number => id != null)
      ),
    ];

    for (const mId of uniqueMinutaIds) {
      const minuta = await prisma.minuta.findUnique({
        where: { id: mId },
      });

      if (!minuta) {
        return res.status(404).json({
          error: `Minuta ${mId} no encontrada`,
        });
      }

      if (minuta.estado === EstadoMinuta.CERRADA) {
        return res.status(400).json({
          error: `La minuta "${minuta.titulo}" está cerrada y no acepta nuevas entradas`,
        });
      }
    }

    const minutaId = uniqueMinutaIds[0] ?? null;

    const files =
      req.files as Express.Multer.File[] | undefined;

    // FIX: Log de diagnóstico — te permite ver si los archivos llegan al backend
    console.log(
      `[crearTarea] archivos recibidos: ${files?.length ?? 0}`,
      files?.map((f) => `${f.fieldname}(${f.mimetype}, ${f.size}b)`) ?? []
    );

    const tareasCompletasResp: any[] = [];

    for (let index = 0; index < tareasPayload.length; index++) {
      const tareaInput = tareasPayload[index];

      if (!tareaInput) continue;

      const isExternalArea =
        calcularIsExternalArea(
          tareaInput.area as Area | undefined
        );

      const fechaVenc = normalizarFechaVencimiento(tareaInput.fechaVencimiento);

      const fechaSeguimiento =
        tareaInput.fechaSeguimiento
          ? new Date(tareaInput.fechaSeguimiento)
          : null;

      // Búsqueda Inteligente de Archivos
      let archivosDeEstaTarea = files
        ? files.filter((f) => f.fieldname.includes(`_tarea_${index}_`) || f.fieldname.includes(`_${index}_`))
        : [];

      // Fallback: Si no encontramos por índice pero hay archivos "huérfanos" (no asignados a tareas previas), 
      // y estamos ante la única tarea o la primera, tomamos lo que haya.
      if (archivosDeEstaTarea.length === 0 && files && files.length > 0) {
          // Si solo hay una tarea, le damos todo lo que llegó (hasta 3)
          if (tareasPayload.length === 1) {
              archivosDeEstaTarea = files.slice(0, 3);
          } else {
              // Si hay varias, intentamos una distribución secuencial simple si el mapeo por nombre falló
              // Esto es un último recurso de seguridad
              const skip = index * 3;
              archivosDeEstaTarea = files.slice(skip, skip + 3);
          }
      }

      // ── Upload paralelo de imágenes ───────────────────────
      const imagenesData = await Promise.all(
        (archivosDeEstaTarea || []).slice(0, 3).map(async (file, i) => {
          try {
            // FIX: pasa el mimetype real (image/png, image/webp, etc.)
            const { url, publicId } = await uploadTaskImage(
              file.buffer,
              file.mimetype
            );
            console.log(
              `[crearTarea] imagen subida OK: ${file.fieldname} → ${url}`
            );
            return { url, publicId, orden: i + 1 };
          } catch (err) {
            // El error es visible ahora; antes fallaba silenciosamente
            console.error(
              `[Cloudinary Error] Tarea ${index} Imagen ${i} (${file.mimetype}):`,
              err
            );
            
            return null;
          }
        })
      );

      // Limpiar fallidos
      const imagenesValidas = imagenesData.filter((img): img is { url: string; publicId: string; orden: number } => img !== null);

      const tareaId = await prisma.$transaction(async (tx) => {
        const totalAsignaciones =
          tareaInput.responsables?.length ?? 0;

        // --- LÓGICA DE EXCLUSIVIDAD ---
        // Una entrada es Tarea (Formalizada) O Seguimiento, pero no ambos.
        let finalFechaVenc = fechaVenc;
        let finalPrioridad = (tareaInput.prioridad as Prioridad | undefined) ?? null;
        let finalRequiereSeguimiento = tareaInput.requiereSeguimiento ?? false;
        let finalFechaSeguimiento = fechaSeguimiento;

        if (finalRequiereSeguimiento) {
          // Si es seguimiento, no puede ser tarea operativa (quita vencimiento y prioridad)
          finalFechaVenc = null;
          finalPrioridad = null;
        }

        const capturaCompleta = calcularCapturaCompleta({
          clasificacion: (tareaInput.clasificacion as Clasificacion | undefined) ?? null,
          fechaVencimiento: finalFechaVenc,
          totalAsignaciones,
        });

        if (capturaCompleta) {
          // Si se formaliza como tarea, se apaga el modo seguimiento informativo
          finalRequiereSeguimiento = false;
          finalFechaSeguimiento = null;
        }
        // ------------------------------

        let departamento: Departamento = req.user!.departamento ?? "DISENO";
        if (req.user!.rol === "ADMIN") {
          departamento = tareaInput.area === "MARKETING" ? "MARKETING" : "DISENO";
        }

        const nueva = await tx.tarea.create({
          data: {
            descripcion: tareaInput.descripcion,
            creadoPorId: usuarioId,
            minutaId: tareaInput.minutaId ?? null,
            departamento: departamento,
            area: (tareaInput.area as Area | undefined) ?? Area.DISENO,
            prioridad: finalPrioridad,
            linea: (tareaInput.linea as Linea | undefined) ?? null,
            clasificacion: tareaInput.clasificacion ?? "OTROS",
            fechaVencimiento: finalFechaVenc,
            fechaSeguimiento: finalFechaSeguimiento,
            requiereSeguimiento: finalRequiereSeguimiento,

            estadoConceptual:
              EstadoConceptual.CAPTURADO,

            estadoOperativo:
              totalAsignaciones > 0
                ? EstadoOperativo.PENDIENTE
                : null,

            estado: EstadoTarea.PENDIENTE,

            capturaCompleta,

            // Formalizada se setea automáticamente cuando la captura está completa
            formalizada: capturaCompleta,
            formalizadoAt: capturaCompleta ? new Date() : null,
            formalizadoPorId: capturaCompleta ? usuarioId : null,

            isExternalArea,

            imagenes: {
              create: imagenesValidas,
            },

            notas:
              tareaInput.notas &&
              tareaInput.notas.length > 0
                ? {
                    create: tareaInput.notas.map((n) => ({
                      contenido: n.contenido,
                      creadoPorId: usuarioId,
                    })),
                  }
                : undefined,
          },
        });

        if (
          tareaInput.responsables &&
          tareaInput.responsables.length > 0
        ) {
          await tx.tareaAsignacion.createMany({
            data: tareaInput.responsables.map(
              (uid) => ({
                tareaId: nueva.id,
                usuarioId: uid,
                tipo: TipoAsignacion.EJECUTOR,
                asignadoPorId: usuarioId,
              })
            ),

            skipDuplicates: true,
          });
        }

        return nueva.id;
      });

      const tareaCompleta =
        await prisma.tarea.findUnique({
          where: {
            id: tareaId,
          },

          include: {
            imagenes: {
              orderBy: {
                orden: "asc",
              },
            },

            asignaciones: {
              include: {
                usuario: {
                  select: {
                    id: true,
                    nombre: true,
                    username: true,
                    imagen: true,
                    rol: true,
                    linea: true,
                  },
                },
              },
            },

            creadoPor: {
              select: {
                id: true,
                nombre: true,
                username: true,
                imagen: true,
                linea: true,
              },
            },

            minuta: {
              select: {
                id: true,
                titulo: true,
                estado: true,
              },
            },

            notas: {
              orderBy: {
                createdAt: "desc",
              },
            },
          },
        });

      tareasCompletasResp.push(tareaCompleta);
    }

    await registrarAccion(
      "CREAR_TAREA_MASIVA",
      usuarioId,
      `Se crearon ${tareasPayload.length} entradas organizacionales`
    );

    try {
      getIO()
        .to("global_updates")
        .emit("nuevas_tareas_creadas", {
          minutaId,

          cantidad: tareasPayload.length,

          tareas: tareasCompletasResp.map((t) => ({
            id: t.id,
            linea: t.linea,
            area: t.area,
            clasificacion: t.clasificacion,
          })),
        });
    } catch (_) {}

    return res.status(201).json({
      status: "success",
      data: tareasCompletasResp,
    });
  } catch (error) {
    await registrarError(
      "CREAR_TAREA",
      req.user?.id ?? null,
      error
    );

    return res.status(500).json({
      error: "Error al crear las tareas",
    });
  }
};