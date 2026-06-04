// minutas-backend/src/modules/tareas/04_update.ts

import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Rol, EstadoTarea, TipoEntrada, Area } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { registrarCambio, normalizarFechaVencimiento, evaluarEstadoMinuta } from "./helpers";
import { notificarAsignacion, notificarTareaActualizada } from "../notificaciones/services";
import type { UpdateTareaInput, UpdateTareaParams } from "./zod";

export const updateTarea = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const rolUsuario = req.user!.rol;
    const { id } = req.params as unknown as UpdateTareaParams;
    const datos = req.body as UpdateTareaInput;

    const camposFase2: (keyof UpdateTareaInput)[] = [
      "tipo", "estado", "alcanceRecordatorio", "prioridad", "fechaVencimiento", "responsables"
    ];

    if (rolUsuario === Rol.COORDINADOR) {
      const intentaCambiarFase2 = camposFase2.some((c) => datos[c] !== undefined);
      if (intentaCambiarFase2) {
        return res.status(403).json({
          error: "No tienes permisos para modificar campos de organización post-junta",
        });
      }
    }

    const tareaActual = await prisma.tarea.findUnique({
      where: { id },
      include: {
        asignaciones: {
          select: { id: true, usuarioId: true },
        },
        imagenes: {
          select: { url: true, publicId: true, orden: true, tipo: true }
        }
      },
    });

    if (!tareaActual) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    if (tareaActual.estado === EstadoTarea.CERRADA || tareaActual.estado === EstadoTarea.CANCELADA) {
      return res.status(400).json({
        error: "Esta entrada ya ha sido cerrada o cancelada y no puede ser modificada",
      });
    }

    const data: Record<string, any> = {};
    const historial: { campo: string; antes: string | null; despues: string | null; }[] = [];

    const verificarYRegistrar = (campo: keyof UpdateTareaInput, valorNuevo: any, valorActual: any) => {
        if (valorNuevo !== undefined && valorNuevo !== valorActual) {
            historial.push({ campo, antes: String(valorActual ?? null), despues: String(valorNuevo ?? null) });
            data[campo] = valorNuevo;
        }
    }

    verificarYRegistrar("descripcion", datos.descripcion, tareaActual.descripcion);
    verificarYRegistrar("area", datos.area, tareaActual.area);
    verificarYRegistrar("linea", datos.linea, tareaActual.linea);
    verificarYRegistrar("clasificacion", datos.clasificacion, tareaActual.clasificacion);
    verificarYRegistrar("prioridad", datos.prioridad, tareaActual.prioridad);
    verificarYRegistrar("tipo", datos.tipo, tareaActual.tipo);
    verificarYRegistrar("estado", datos.estado, tareaActual.estado);
    verificarYRegistrar("alcanceRecordatorio", datos.alcanceRecordatorio, tareaActual.alcanceRecordatorio);
    
    if (datos.fechaVencimiento !== undefined) {
      const nuevaFecha = normalizarFechaVencimiento(datos.fechaVencimiento);
      const antes = tareaActual.fechaVencimiento?.toISOString() ?? null;
      const despues = nuevaFecha?.toISOString() ?? null;
      if (antes !== despues) {
        historial.push({ campo: "fechaVencimiento", antes, despues });
        data.fechaVencimiento = nuevaFecha;
      }
    }

    let idsAgregar: number[] = [];
    let hermanasSincronizadas = 0;

    await prisma.$transaction(async (tx) => {
      // 1. Obtener todas las tareas hermanas del mismo grupo si ya existe
      let tareasGrupo: any[] = [];
      if (tareaActual.minutaId && tareaActual.organizadoAt && tareaActual.tipo === TipoEntrada.TAREA) {
        tareasGrupo = await tx.tarea.findMany({
          where: {
            minutaId: tareaActual.minutaId,
            organizadoAt: tareaActual.organizadoAt,
            tipo: TipoEntrada.TAREA
          },
          include: {
            asignaciones: true,
            imagenes: true
          }
        });
      } else {
        // Si no está agrupado, el grupo es solo la tarea actual
        tareasGrupo = [
          {
            ...tareaActual,
            asignaciones: tareaActual.asignaciones,
            imagenes: tareaActual.imagenes || []
          }
        ];
      }

      // Manejo de responsables
      if (datos.responsables !== undefined && (datos.tipo === TipoEntrada.TAREA || tareaActual.tipo === TipoEntrada.TAREA)) {
        const nuevosResponsables = datos.responsables; // number[]

        if (nuevosResponsables.length > 0) {
          // Aseguramos que todas las tareas del grupo compartan la misma marca de tiempo organizadoAt
          const organizadoAt = tareaActual.organizadoAt || new Date();
          data.organizadoAt = organizadoAt;

          // Mapa de responsables actuales en el grupo a su respectiva tarea
          const mapResponsableATarea = new Map<number, any>();
          for (const t of tareasGrupo) {
            for (const asig of t.asignaciones) {
              mapResponsableATarea.set(asig.usuarioId, t);
            }
          }

          // La tarea principal (id) se asignará al primer responsable
          const primerResponsable = nuevosResponsables[0]!;
          
          // Actualizar la tarea principal
          await tx.tareaAsignacion.deleteMany({ where: { tareaId: id } });
          await tx.tareaAsignacion.create({
            data: { tareaId: id, usuarioId: primerResponsable, asignadoPorId: usuarioId }
          });
          
          // IDs de las tareas que mantendremos
          const tareasMantenerIds = new Set<number>([id]);

          // Procesar el resto de los nuevos responsables
          for (let i = 1; i < nuevosResponsables.length; i++) {
            const respId = nuevosResponsables[i]!;
            
            // Buscar si ya existe una tarea para este responsable en el grupo (que no sea la tarea principal)
            const tareaExistente = mapResponsableATarea.get(respId);
            
            if (tareaExistente && tareaExistente.id !== id) {
              // Si ya existe, la mantenemos y la actualizaremos con el resto de campos
              tareasMantenerIds.add(tareaExistente.id);
            } else {
              const clon = await tx.tarea.create({
                data: {
                  descripcion: datos.descripcion !== undefined ? datos.descripcion : tareaActual.descripcion,
                  departamento: tareaActual.departamento,
                  area: (datos.area !== undefined ? datos.area : tareaActual.area) as Area,
                  linea: datos.linea !== undefined ? datos.linea : tareaActual.linea,
                  clasificacion: (datos.clasificacion !== undefined ? datos.clasificacion : tareaActual.clasificacion) as any,
                  minutaId: tareaActual.minutaId,
                  creadoPorId: tareaActual.creadoPorId,
                  organizadoPorId: usuarioId,
                  organizadoAt,
                  tipo: TipoEntrada.TAREA,
                  estado: datos.estado !== undefined ? datos.estado : (tareaActual.estado || EstadoTarea.PENDIENTE),
                  prioridad: datos.prioridad !== undefined ? datos.prioridad : tareaActual.prioridad,
                  fechaVencimiento: data.fechaVencimiento !== undefined ? data.fechaVencimiento : tareaActual.fechaVencimiento,
                }
              });

              // Asignar al responsable correspondiente
              await tx.tareaAsignacion.create({
                data: { tareaId: clon.id, usuarioId: respId, asignadoPorId: usuarioId }
              });

              // Clonar imágenes de captura
              const imagenesCaptura = (tareaActual.imagenes || []).filter(img => img.tipo !== 'EVIDENCIA');
              if (imagenesCaptura.length > 0) {
                await tx.tareaImagen.createMany({
                  data: imagenesCaptura.map((img) => ({
                    tareaId: clon.id,
                    url: img.url,
                    publicId: img.publicId,
                    orden: img.orden,
                    tipo: img.tipo,
                  })),
                  skipDuplicates: true,
                });
              }

              tareasMantenerIds.add(clon.id);
            }
          }

          // Eliminar las tareas del grupo que ya no tienen responsable asignado
          for (const t of tareasGrupo) {
            if (!tareasMantenerIds.has(t.id)) {
              if (t.estado && ['CERRADA', 'CANCELADA', 'EN_REVISION'].includes(t.estado.toUpperCase())) {
                throw new Error(`BLOQUEADO: No se puede eliminar a un responsable cuya tarea ya está ${t.estado.toLowerCase()}`);
              }
              await tx.tareaAsignacion.deleteMany({ where: { tareaId: t.id } });
              await tx.tareaImagen.deleteMany({ where: { tareaId: t.id } });
              await tx.tareaNota.deleteMany({ where: { tareaId: t.id } });
              await tx.tarea.delete({ where: { id: t.id } });
            }
          }

          hermanasSincronizadas = tareasMantenerIds.size > 0 ? tareasMantenerIds.size - 1 : 0;

          // Actualizar los campos comunes para todas las tareas que mantenemos
          if (Object.keys(data).length > 0) {
            await tx.tarea.updateMany({
              where: { id: { in: Array.from(tareasMantenerIds) } },
              data
            });
          }

        } else {
          // Si el array de responsables está vacío, simplemente limpiamos las asignaciones de la tarea actual
          await tx.tareaAsignacion.deleteMany({ where: { tareaId: id } });
          
          // Y eliminamos el resto del grupo
          for (const t of tareasGrupo) {
            if (t.id !== id) {
              await tx.tareaAsignacion.deleteMany({ where: { tareaId: t.id } });
              await tx.tareaImagen.deleteMany({ where: { tareaId: t.id } });
              await tx.tareaNota.deleteMany({ where: { tareaId: t.id } });
              await tx.tarea.delete({ where: { id: t.id } });
            }
          }

          if (Object.keys(data).length > 0) {
            await tx.tarea.update({ where: { id }, data });
          }
        }

      } else {
        // Flujo normal sin cambio de responsables
        if (Object.keys(data).length > 0) {
          // Actualizar la tarea actual
          await tx.tarea.update({ where: { id }, data });

          // Propagar cambios a las hermanas del grupo
          if (tareaActual.minutaId && tareaActual.organizadoAt && tareaActual.tipo === TipoEntrada.TAREA) {
            const camposPropagar: Record<string, any> = {};
            if (data.descripcion !== undefined) camposPropagar.descripcion = data.descripcion;
            if (data.area !== undefined) camposPropagar.area = data.area;
            if (data.linea !== undefined) camposPropagar.linea = data.linea;
            if (data.clasificacion !== undefined) camposPropagar.clasificacion = data.clasificacion;
            if (data.prioridad !== undefined) camposPropagar.prioridad = data.prioridad;
            if (data.fechaVencimiento !== undefined) camposPropagar.fechaVencimiento = data.fechaVencimiento;
            
            if (Object.keys(camposPropagar).length > 0) {
              const resUpdate = await tx.tarea.updateMany({
                where: {
                  minutaId: tareaActual.minutaId,
                  organizadoAt: tareaActual.organizadoAt,
                  tipo: TipoEntrada.TAREA,
                  id: { not: id }
                },
                data: camposPropagar
              });
              hermanasSincronizadas = resUpdate.count;
            }
          }
        }
      }
    });

    if (historial.length > 0) {
      await Promise.all(
        historial.map((h) => registrarCambio(id, usuarioId, h.campo, h.antes, h.despues))
      );
    }

    await registrarAccion("ACTUALIZAR_TAREA", usuarioId, `Entrada organizacional ${id}`);

    // Reevaluar estado de la minuta
    if (tareaActual.minutaId) {
      await evaluarEstadoMinuta(tareaActual.minutaId, usuarioId);
    }

    const tareaActualizada = await prisma.tarea.findUnique({
      where: { id },
      include: {
        imagenes: { orderBy: { orden: "asc" } },
        asignaciones: { include: { usuario: { select: { id: true, nombre: true, username: true, imagen: true, rol: true, linea: true } } } },
        creadoPor: { select: { id: true, nombre: true, username: true, imagen: true, linea: true } },
        minuta: { select: { id: true, titulo: true, estado: true } },
        notas: { orderBy: { createdAt: "desc" } },
      },
    });

    if (tareaActualizada) {
      if (idsAgregar.length > 0) {
        await notificarAsignacion(id, idsAgregar, tareaActualizada.descripcion, tareaActualizada.linea);
      }
      if (historial.length > 0) {
        const idsResponsablesNuevosExcluidos = tareaActualizada.asignaciones
          .map((a) => a.usuarioId)
          .filter((uid) => !idsAgregar.includes(uid));

        if (idsResponsablesNuevosExcluidos.length > 0) {
          await notificarTareaActualizada(id, tareaActualizada.descripcion, idsResponsablesNuevosExcluidos, usuarioId);
        }
      }
    }

    return res.json({ status: "success", data: tareaActualizada, hermanasSincronizadas });
  } catch (error: any) {
    await registrarError("ACTUALIZAR_TAREA", req.user?.id ?? null, error);
    if (error instanceof Error && error.message.startsWith('BLOQUEADO:')) {
      return res.status(400).json({ error: error.message.replace('BLOQUEADO: ', '') });
    }
    return res.status(500).json({ error: "Error al actualizar tarea" });
  }
};