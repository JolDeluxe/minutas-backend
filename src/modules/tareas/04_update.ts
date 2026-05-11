// minutas-backend/src/modules/tareas/04_update.ts

import type { Request, Response } from "express";

import { prisma } from "../../db";

import {
  Area,
  Linea,
  Prioridad,
  Clasificacion,
  EstadoOperativo,
  Rol,
} from "@prisma/client";

import {
  registrarAccion,
  registrarError,
} from "../../utils/logger";

import {
  calcularIsExternalArea,
  calcularCapturaCompleta,
  registrarCambio,
} from "./helpers";

import type {
  UpdateTareaInput,
  UpdateTareaParams,
} from "./zod";

export const updateTarea = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = req.user!.id;
    const rolUsuario = req.user!.rol;

    const { id } =
      req.params as unknown as UpdateTareaParams;

    const datos =
      req.body as UpdateTareaInput;

    // ── Validación de permisos por rol ────────────────────────
    // COORDINADOR solo puede editar descripción y campos de captura básica.
    // Campos de Fase 2 (organización post-junta) requieren JEFE o GERENCIA.
    const camposFase2: (keyof UpdateTareaInput)[] = [
      "area", "linea", "clasificacion", "prioridad",
      "estadoConceptual", "estadoOperativo",
      "fechaVencimiento", "responsables", "formalizada",
    ];

    if (rolUsuario === Rol.COORDINADOR) {
      const intentaCambiarFase2 = camposFase2.some(
        (c) => datos[c] !== undefined
      );

      if (intentaCambiarFase2) {
        return res.status(403).json({
          error:
            "No tienes permisos para modificar campos de organización post-junta",
        });
      }
    }

    const tareaActual =
      await prisma.tarea.findUnique({
        where: { id },

        include: {
          asignaciones: {
            select: {
              id: true,
              usuarioId: true,
            },
          },
        },
      });

    if (!tareaActual) {
      return res.status(404).json({
        error: "Tarea no encontrada",
      });
    }

    const data: Record<string, any> = {};

    const historial: {
      campo: string;
      antes: string | null;
      despues: string | null;
    }[] = [];

    if (
      datos.descripcion !== undefined &&
      datos.descripcion !== tareaActual.descripcion
    ) {
      historial.push({
        campo: "descripcion",
        antes: tareaActual.descripcion,
        despues: datos.descripcion,
      });

      data.descripcion = datos.descripcion;
    }

    if (datos.area !== undefined) {
      const val =
        (datos.area ?? null) as Area | null;

      if (val !== tareaActual.area) {
        historial.push({
          campo: "area",
          antes: tareaActual.area,
          despues: val,
        });

        data.area = val;
        data.isExternalArea =
          calcularIsExternalArea(val);
      }
    }

    if (datos.linea !== undefined) {
      const val =
        (datos.linea ?? null) as Linea | null;

      if (val !== tareaActual.linea) {
        historial.push({
          campo: "linea",
          antes: tareaActual.linea,
          despues: val,
        });

        data.linea = val;
      }
    }

    if (datos.prioridad !== undefined) {
      const val =
        (datos.prioridad ?? null) as Prioridad | null;

      if (val !== tareaActual.prioridad) {
        historial.push({
          campo: "prioridad",
          antes: tareaActual.prioridad,
          despues: val,
        });

        data.prioridad = val;
      }
    }

    if (datos.clasificacion !== undefined) {
      const val =
        (datos.clasificacion ?? null) as Clasificacion | null;

      if (val !== tareaActual.clasificacion) {
        historial.push({
          campo: "clasificacion",
          antes: tareaActual.clasificacion,
          despues: val,
        });

        data.clasificacion = val;
      }
    }

    if (datos.estadoConceptual !== undefined) {
      if (
        datos.estadoConceptual !==
        tareaActual.estadoConceptual
      ) {
        historial.push({
          campo: "estadoConceptual",
          antes: tareaActual.estadoConceptual,
          despues: datos.estadoConceptual,
        });

        data.estadoConceptual =
          datos.estadoConceptual;
      }
    }

    if (datos.fechaSeguimiento !== undefined) {
      const nuevaFecha =
        datos.fechaSeguimiento
          ? new Date(datos.fechaSeguimiento)
          : null;

      const antes =
        tareaActual.fechaSeguimiento?.toISOString() ??
        null;

      const despues =
        nuevaFecha?.toISOString() ?? null;

      if (antes !== despues) {
        historial.push({
          campo: "fechaSeguimiento",
          antes,
          despues,
        });

        data.fechaSeguimiento = nuevaFecha;
      }
    }

    if (datos.requiereSeguimiento !== undefined) {
      if (
        datos.requiereSeguimiento !==
        tareaActual.requiereSeguimiento
      ) {
        historial.push({
          campo: "requiereSeguimiento",
          antes: String(
            tareaActual.requiereSeguimiento
          ),
          despues: String(
            datos.requiereSeguimiento
          ),
        });

        data.requiereSeguimiento =
          datos.requiereSeguimiento;
      }
    }

    if (datos.fechaVencimiento !== undefined) {
      const nuevaFecha =
        datos.fechaVencimiento
          ? new Date(datos.fechaVencimiento)
          : null;

      const antes =
        tareaActual.fechaVencimiento?.toISOString() ??
        null;

      const despues =
        nuevaFecha?.toISOString() ?? null;

      if (antes !== despues) {
        historial.push({
          campo: "fechaVencimiento",
          antes,
          despues,
        });

        data.fechaVencimiento = nuevaFecha;
      }
    }

    // ── Asignaciones y update en transacción ─────────────────
    let totalAsignacionesFinal =
      tareaActual.asignaciones.length;

    await prisma.$transaction(async (tx) => {
      if (datos.responsables !== undefined) {
        const idsActuales = new Set(
          tareaActual.asignaciones.map(
            (a) => a.usuarioId
          )
        );

        const idsNuevos = new Set(
          datos.responsables
        );

        const idsAgregar =
          datos.responsables.filter(
            (uid) => !idsActuales.has(uid)
          );

        const idsEliminar =
          tareaActual.asignaciones
            .filter(
              (a) => !idsNuevos.has(a.usuarioId)
            )
            .map((a) => a.id);

        if (idsEliminar.length > 0) {
          await tx.tareaAsignacion.deleteMany({
            where: {
              id: {
                in: idsEliminar,
              },
            },
          });
        }

        if (idsAgregar.length > 0) {
          await tx.tareaAsignacion.createMany({
            data: idsAgregar.map((uid) => ({
              tareaId: id,
              usuarioId: uid,
              asignadoPorId: usuarioId,
            })),

            skipDuplicates: true,
          });
        }

        totalAsignacionesFinal =
          datos.responsables.length;
      }

      // ── Calcular capturaCompleta y formalizada ───────────
      const clasificacionFinal =
        data.clasificacion !== undefined
          ? data.clasificacion
          : tareaActual.clasificacion;

      const fechaFinal =
        data.fechaVencimiento !== undefined
          ? data.fechaVencimiento
          : tareaActual.fechaVencimiento;

      const capturaCompleta =
        calcularCapturaCompleta({
          clasificacion: clasificacionFinal,
          fechaVencimiento: fechaFinal,
          totalAsignaciones: totalAsignacionesFinal,
        });

      data.capturaCompleta = capturaCompleta;

      // Gestionar formalización automática
      if (capturaCompleta && !tareaActual.formalizada) {
        data.formalizada = true;
        data.formalizadoAt = new Date();
        data.formalizadoPorId = usuarioId;
      }

      // ── estadoOperativo: solo cambiar cuando hay transición real ──
      // NO resetear a PENDIENTE si ya está EN_PROGRESO o COMPLETADO.
      if (totalAsignacionesFinal > 0 && tareaActual.estadoOperativo === null) {
        // Transición de "sin asignaciones" a "con asignaciones"
        data.estadoOperativo = EstadoOperativo.PENDIENTE;
      } else if (totalAsignacionesFinal === 0 && tareaActual.estadoOperativo !== null) {
        // Se eliminaron todas las asignaciones
        data.estadoOperativo = null;
      }
      // En cualquier otro caso: NO tocar estadoOperativo.

      if (Object.keys(data).length > 0) {
        await tx.tarea.update({
          where: { id },
          data,
        });
      }
    });

    if (historial.length > 0) {
      await Promise.all(
        historial.map((h) =>
          registrarCambio(
            id,
            usuarioId,
            h.campo,
            h.antes,
            h.despues
          )
        )
      );
    }

    await registrarAccion(
      "ACTUALIZAR_TAREA",
      usuarioId,
      `Entrada organizacional ${id}`
    );

    const tareaActualizada =
      await prisma.tarea.findUnique({
        where: { id },

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

    return res.json({
      status: "success",
      data: tareaActualizada,
    });
  } catch (error) {
    await registrarError(
      "ACTUALIZAR_TAREA",
      req.user?.id ?? null,
      error
    );

    return res.status(500).json({
      error: "Error al actualizar tarea",
    });
  }
};