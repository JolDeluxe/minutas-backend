// minutas-backend/src/modules/tareas/02_create.ts

import type { Request, Response } from "express";
import { prisma } from "../../db";

import {
  Area,
  Prioridad,
  EstadoMinuta,
  EstadoTarea,
  Departamento,
  TipoEntrada,
  AlcanceRecordatorio,
} from "@prisma/client";

import {
  registrarAccion,
  registrarError,
} from "../../utils/logger";

import { uploadTaskImage } from "../../utils/cloudinary";

import {
  normalizarFechaVencimiento,
} from "./helpers";

import { getIO } from "../../utils/socket";
import { notificarAsignacion } from "../notificaciones/services";
import type { CreateTareaInput } from "./zod";

export const crearTarea = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = req.user!.id;

    console.log(`[crearTarea] Payload recibido (body):`, JSON.stringify(req.body, null, 2));
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

      if (minuta.estado === EstadoMinuta.CERRADA || minuta.estado === EstadoMinuta.CANCELADA) {
        return res.status(400).json({
          error: `La minuta "${minuta.titulo}" está cerrada o cancelada y no acepta nuevas entradas`,
        });
      }
    }

    const minutaId = uniqueMinutaIds[0] ?? null;

    const files =
      req.files as Express.Multer.File[] | undefined;

    console.log(
      `[crearTarea] archivos recibidos: ${files?.length ?? 0}`,
      files?.map((f) => `${f.fieldname}(${f.mimetype}, ${f.size}b)`) ?? []
    );

    const tareasCompletasResp: any[] = [];

    for (let index = 0; index < tareasPayload.length; index++) {
      const tareaInput = tareasPayload[index];

      if (!tareaInput) continue;

      const fechaVenc = normalizarFechaVencimiento(tareaInput.fechaVencimiento);

      // Búsqueda de archivos simplificada y robusta
      const fieldNamePrefix = `files_${index}_`;
      let archivosDeEstaTarea = files
        ? files.filter((f) => f.fieldname.startsWith(fieldNamePrefix))
        : [];

      console.log(`[crearTarea] Tarea #${index}: Buscando con prefijo "${fieldNamePrefix}". Encontrados: ${archivosDeEstaTarea.length} archivos.`);

      // Fallback por si la nomenclatura falla (no debería con el nuevo frontend)
      if (archivosDeEstaTarea.length === 0 && files && files.length > 0 && tareasPayload.length === 1) {
          console.warn(`[crearTarea] Tarea #${index}: No se encontraron archivos por prefijo, aplicando fallback para única tarea.`);
          archivosDeEstaTarea = files.slice(0, 3);
      }

      // ── Upload paralelo de imágenes ───────────────────────
      const imagenesData = await Promise.all(
        (archivosDeEstaTarea || []).slice(0, 3).map(async (file, i) => {
          // NOTA: El try/catch ahora está fuera del Promise.all
          // Si una imagen falla, todo el bloque de creación de tareas fallará.
          const { url, publicId } = await uploadTaskImage(
            file.buffer,
            file.mimetype
          );
          console.log(
            `[crearTarea] imagen subida OK: ${file.fieldname} → ${url}`
          );
          return { url, publicId, orden: i + 1 };
        })
      );

      const imagenesValidas = imagenesData.filter((img): img is { url: string; publicId: string; orden: number } => img !== null);

      const tareaIds = await prisma.$transaction(async (tx) => {
        let departamento: Departamento = req.user!.departamento ?? "DISENO";
        if (req.user!.rol === "ADMIN") {
          departamento = tareaInput.area === "MARKETING" ? "MARKETING" : "DISENO";
        }

        const tipoEntrada = tareaInput.tipo ?? TipoEntrada.SIN_ORGANIZAR;
        const responsablesIds = tareaInput.responsables ?? [];
        const esMultiResponsable = tipoEntrada === TipoEntrada.TAREA && responsablesIds.length > 1;
        const organizadoAt = esMultiResponsable ? new Date() : null;

        const nueva = await tx.tarea.create({
          data: {
            descripcion: tareaInput.descripcion,
            creadoPorId: usuarioId,
            minutaId: tareaInput.minutaId ?? null,
            departamento: departamento,
            area: (tareaInput.area as Area | undefined) ?? Area.DISENO,
            prioridad: tareaInput.prioridad ?? null,
            linea: (tareaInput.linea as string | undefined) ?? null,
            clasificacion: tareaInput.clasificacion ?? "OTROS",
            fechaVencimiento: fechaVenc,
            tipo: tipoEntrada,
            estado: tareaInput.estado ?? (tipoEntrada === TipoEntrada.TAREA ? EstadoTarea.PENDIENTE : null),
            alcanceRecordatorio: tareaInput.alcanceRecordatorio ?? null,
            organizadoAt: organizadoAt,
            organizadoPorId: esMultiResponsable ? usuarioId : null,

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

        const createdIds = [nueva.id];

        if (responsablesIds.length > 0) {
          if (esMultiResponsable) {
            // Asignar el primer responsable a la tarea principal
            await tx.tareaAsignacion.create({
              data: {
                tareaId: nueva.id,
                usuarioId: responsablesIds[0]!,
                asignadoPorId: usuarioId,
              }
            });

            // Crear copias para los otros responsables
            for (let i = 1; i < responsablesIds.length; i++) {
              const clon = await tx.tarea.create({
                data: {
                  descripcion: tareaInput.descripcion,
                  creadoPorId: usuarioId,
                  minutaId: tareaInput.minutaId ?? null,
                  departamento: departamento,
                  area: (tareaInput.area as Area | undefined) ?? Area.DISENO,
                  prioridad: tareaInput.prioridad ?? null,
                  linea: (tareaInput.linea as string | undefined) ?? null,
                  clasificacion: tareaInput.clasificacion ?? "OTROS",
                  fechaVencimiento: fechaVenc,
                  tipo: tipoEntrada,
                  estado: tareaInput.estado ?? EstadoTarea.PENDIENTE,
                  alcanceRecordatorio: tareaInput.alcanceRecordatorio ?? null,
                  organizadoAt: organizadoAt,
                  organizadoPorId: usuarioId,

                  imagenes: {
                    create: imagenesValidas.map(img => ({
                      url: img.url,
                      publicId: img.publicId,
                      orden: img.orden,
                    })),
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
                }
              });

              await tx.tareaAsignacion.create({
                data: {
                  tareaId: clon.id,
                  usuarioId: responsablesIds[i]!,
                  asignadoPorId: usuarioId,
                }
              });

              createdIds.push(clon.id);
            }
          } else {
            // Flujo normal (1 responsable o no es TAREA)
            await tx.tareaAsignacion.createMany({
              data: responsablesIds.map(
                (uid) => ({
                  tareaId: nueva.id,
                  usuarioId: uid,
                  asignadoPorId: usuarioId,
                })
              ),
              skipDuplicates: true,
            });
          }
        }

        return createdIds;
      });

      for (const tId of tareaIds) {
        const tareaCompleta = await prisma.tarea.findUnique({
          where: {
            id: tId,
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

        if (tareaCompleta) {
          tareasCompletasResp.push(tareaCompleta);
          
          const asig = tareaCompleta.asignaciones?.[0];
          if (asig) {
            await notificarAsignacion(
              tareaCompleta.id,
              [asig.usuarioId],
              tareaCompleta.descripcion,
              tareaCompleta.linea
            );
          }
        }
      }
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

      if (minutaId) {
        getIO()
          .to(`minuta_${minutaId}`)
          .emit("minuta:entries_saved", { minutaId });
      }
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
      error: "Error al crear las entradas organizacionales",
    });
  }
};