// minutas-backend/src/modules/minutas_externas/07_tareas.ts
import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import { USUARIO_SELECT_BASICO } from "../shared-selects";
import type { CreateTareaExternaInput, UpdateTareaExternaInput, ChangeEstadoTareaExternaInput, CreateTareaExternaNotaInput } from "./zod";
import { uploadTaskImage } from "../../utils/cloudinary";

export const createTareasExternas = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const minutaExternaId = Number(req.params.minutaId);
    const { tareas } = req.body as CreateTareaExternaInput;

    const minuta = await prisma.minutaExterna.findUnique({ where: { id: minutaExternaId } });
    if (!minuta) return res.status(404).json({ error: "Minuta externa no encontrada" });

    const files = req.files as Express.Multer.File[] | undefined;

    const creadas = await Promise.all(
      tareas.map(async (t, index) => {
        const fieldNamePrefix = `files_${index}_`;
        let archivosDeEstaTarea = files
          ? files.filter((f) => f.fieldname.startsWith(fieldNamePrefix))
          : [];

        if (archivosDeEstaTarea.length === 0 && files && files.length > 0 && tareas.length === 1) {
          archivosDeEstaTarea = files.slice(0, 3);
        }

        const imagenesData = await Promise.all(
          (archivosDeEstaTarea || []).slice(0, 3).map(async (file, i) => {
            const { url, publicId } = await uploadTaskImage(
              file.buffer,
              file.mimetype,
              file.originalname
            );
            return { url, publicId, orden: i + 1 };
          })
        );

        const tarea = await prisma.tareaExterna.create({
          data: {
            minutaExternaId,
            creadoPorId: usuarioId,
            descripcion: t.descripcion,
            area: t.area,
            departamento: t.departamento || null,
            estado: t.estado || "PENDIENTE",
            prioridad: t.prioridad || null,
            fechaVencimiento: t.fechaVencimiento || null,
            imagenes: {
              create: imagenesData,
            },
            notas: t.notas && t.notas.length > 0 ? {
              create: t.notas.map(n => ({ contenido: n.contenido, creadoPorId: usuarioId }))
            } : undefined
          },
          include: {
            creadoPor: { select: USUARIO_SELECT_BASICO },
            imagenes: { orderBy: { orden: "asc" } },
            notas: { orderBy: { createdAt: "desc" } }
          }
        });
        return tarea;
      })
    );

    return res.status(201).json({ status: "success", data: creadas });
  } catch (error) {
    await registrarError("CREATE_TAREAS_EXTERNAS", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al crear tareas externas" });
  }
};

export const updateTareaExterna = async (req: Request, res: Response) => {
  try {
    const tareaId = Number(req.params.id);
    const { descripcion, area, departamento, estado, prioridad, fechaVencimiento } = req.body as UpdateTareaExternaInput;

    const tarea = await prisma.tareaExterna.findUnique({ where: { id: tareaId } });
    if (!tarea) return res.status(404).json({ error: "Tarea externa no encontrada" });

    const updated = await prisma.tareaExterna.update({
      where: { id: tareaId },
      data: {
        ...(descripcion !== undefined && { descripcion }),
        ...(area !== undefined && { area }),
        ...(departamento !== undefined && { departamento }),
        ...(estado !== undefined && { estado, completadoAt: estado === 'CERRADA' ? new Date() : null }),
        ...(prioridad !== undefined && { prioridad }),
        ...(fechaVencimiento !== undefined && { fechaVencimiento }),
      },
      include: { creadoPor: { select: USUARIO_SELECT_BASICO } }
    });

    return res.json({ status: "success", data: updated });
  } catch (error) {
    await registrarError("UPDATE_TAREA_EXTERNA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al actualizar tarea externa" });
  }
};

export const deleteTareaExterna = async (req: Request, res: Response) => {
  try {
    const tareaId = Number(req.params.id);
    
    const tarea = await prisma.tareaExterna.findUnique({ where: { id: tareaId } });
    if (!tarea) return res.status(404).json({ error: "Tarea externa no encontrada" });

    await prisma.tareaExterna.update({
      where: { id: tareaId },
      data: { estado: "CANCELADA" }
    });

    return res.json({ status: "success", message: "Tarea externa eliminada (soft delete)" });
  } catch (error) {
    await registrarError("DELETE_TAREA_EXTERNA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al eliminar tarea externa" });
  }
};

export const toggleNotificadoExterna = async (req: Request, res: Response) => {
  try {
    const tareaId = Number(req.params.id);
    
    const tarea = await prisma.tareaExterna.findUnique({ where: { id: tareaId } });
    if (!tarea) return res.status(404).json({ error: "Tarea externa no encontrada" });

    const isNotified = tarea.notificadoAt !== null;

    const updated = await prisma.tareaExterna.update({
      where: { id: tareaId },
      data: { 
        notificadoAt: isNotified ? null : new Date(),
        // Si la marcamos como "notificada" en este módulo significa "Completada"
        estado: isNotified ? "PENDIENTE" : "CERRADA",
        completadoAt: isNotified ? null : new Date()
      }
    });

    return res.json({ status: "success", data: updated });
  } catch (error) {
    await registrarError("TOGGLE_NOTIFICADO_EXTERNA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al cambiar estado de completado" });
  }
};

export const createTareaExternaNota = async (req: Request, res: Response) => {
  try {
    const data = req.body as CreateTareaExternaNotaInput;
    const usuarioId = req.user!.id;

    // Verificar si existe la tarea externa
    const tarea = await prisma.tareaExterna.findUnique({
      where: { id: data.tareaExternaId },
    });

    if (!tarea) {
      return res.status(404).json({
        error: "Tarea externa no encontrada",
      });
    }

    const nota = await prisma.tareaExternaNota.create({
      data: {
        contenido: data.contenido,
        tareaExternaId: data.tareaExternaId,
        creadoPorId: usuarioId,
      },
      include: {
        creadoPor: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });

    return res.status(201).json({
      status: "success",
      data: nota,
    });
  } catch (error) {
    await registrarError("CREAR_NOTA_TAREA_EXTERNA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al crear la nota de tarea externa" });
  }
};

export const updateTareaExternaNota = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { contenido } = req.body;

    const nota = await prisma.tareaExternaNota.findUnique({
      where: { id: Number(id) },
    });

    if (!nota) {
      return res.status(404).json({ error: "Nota no encontrada" });
    }

    const updated = await prisma.tareaExternaNota.update({
      where: { id: Number(id) },
      data: { contenido },
    });

    return res.json({ status: "success", data: updated });
  } catch (error) {
    await registrarError("ACTUALIZAR_NOTA_TAREA_EXTERNA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al actualizar la nota" });
  }
};

export const deleteTareaExternaNota = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.tareaExternaNota.delete({
      where: { id: Number(id) },
    });

    return res.json({ status: "success", message: "Nota eliminada" });
  } catch (error) {
    await registrarError("ELIMINAR_NOTA_TAREA_EXTERNA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al eliminar la nota" });
  }
};

