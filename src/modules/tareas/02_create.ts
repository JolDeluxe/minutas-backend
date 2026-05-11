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
} from "@prisma/client";

import {
  registrarAccion,
  registrarError,
} from "../../utils/logger";

import { uploadTaskImage } from "../../utils/cloudinary";

import {
  calcularIsExternalArea,
  calcularCapturaCompleta,
} from "./helpers";

import { getIO } from "../../utils/socket";

import type { CreateTareaInput } from "./zod";

export const crearTarea = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = req.user!.id;

    const tareasPayload =
      req.body.tareas as CreateTareaInput[];

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

    const tareasCompletasResp: any[] = [];

    for (let index = 0; index < tareasPayload.length; index++) {
      const tareaInput = tareasPayload[index];

      if (!tareaInput) continue;

      const isExternalArea =
        calcularIsExternalArea(
          tareaInput.area as Area | undefined
        );

      const fechaVenc =
        tareaInput.fechaVencimiento
          ? new Date(tareaInput.fechaVencimiento)
          : null;

      const fechaSeguimiento =
        tareaInput.fechaSeguimiento
          ? new Date(tareaInput.fechaSeguimiento)
          : null;

      const archivosDeEstaTarea =
        files?.filter((f) =>
          f.fieldname.startsWith(`imagen_tarea_${index}_`)
        ) || [];

      // ── Upload paralelo de imágenes ───────────────────────
      const imagenesData = await Promise.all(
        archivosDeEstaTarea.slice(0, 3).map(async (file, i) => {
          const { url, publicId } =
            await uploadTaskImage(file.buffer);

          return {
            url,
            publicId,
            orden: i + 1,
          };
        })
      );

      const tareaId = await prisma.$transaction(async (tx) => {
        const totalAsignaciones =
          tareaInput.responsables?.length ?? 0;

        const capturaCompleta =
          calcularCapturaCompleta({
            clasificacion:
              (tareaInput.clasificacion as Clasificacion | undefined) ??
              null,

            fechaVencimiento: fechaVenc,

            totalAsignaciones,
          });

        const nueva = await tx.tarea.create({
          data: {
            descripcion: tareaInput.descripcion,

            creadoPorId: usuarioId,

            minutaId:
              tareaInput.minutaId ?? null,

            area:
              (tareaInput.area as Area | undefined) ??
              Area.DISENO,

            prioridad:
              (tareaInput.prioridad as Prioridad | undefined) ??
              null,

            linea:
              (tareaInput.linea as Linea | undefined) ??
              null,

            clasificacion:
              (tareaInput.clasificacion as Clasificacion | undefined) ??
              null,

            fechaVencimiento: fechaVenc,

            fechaSeguimiento,

            requiereSeguimiento:
              tareaInput.requiereSeguimiento ?? false,

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
              create: imagenesData,
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
                    area: true,
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
                area: true,
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