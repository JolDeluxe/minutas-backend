import type { Request, Response } from "express";
import { prisma } from "../../db";
import {
  registrarAccion,
  registrarError,
} from "../../utils/logger";

import {
  uploadTaskImage,
  deleteImageByPublicId,
} from "../../utils/cloudinary";

import type {
  TareaIdParams,
  ImagenIdParams,
} from "./zod";

export const addImagenTarea = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = req.user!.id;
    const { id } = req.params as unknown as TareaIdParams;
    const tipo = req.body.tipo === 'EVIDENCIA' ? 'EVIDENCIA' : 'CAPTURA';

    const tarea = await prisma.tarea.findUnique({
      where: { id },
      include: { imagenes: true },
    });

    if (!tarea) {
      return res.status(404).json({ error: "Entrada no encontrada" });
    }

    const imagenesDelTipo = tarea.imagenes.filter(img => img.tipo === tipo);

    if (imagenesDelTipo.length >= 3) {
      return res.status(400).json({ error: `Máximo 3 imágenes de tipo ${tipo} por entrada` });
    }

    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No se proporcionó ninguna imagen" });
    }

    // Find sister tasks if this is a CAPTURA image and the task is part of a group
    let hermanas: any[] = [];
    if (tipo === 'CAPTURA' && tarea.minutaId && tarea.organizadoAt && tarea.tipo === 'TAREA') {
      hermanas = await prisma.tarea.findMany({
        where: {
          minutaId: tarea.minutaId,
          organizadoAt: tarea.organizadoAt,
          tipo: 'TAREA',
          id: { not: id }
        }
      });
    }

    const { url, publicId } = await uploadTaskImage(file.buffer, file.mimetype, file.originalname);

    const orden = imagenesDelTipo.length + 1;

    // Use a transaction to create the image for the primary task and propagate to sister tasks
    const imagen = await prisma.$transaction(async (tx) => {
      const mainImg = await tx.tareaImagen.create({
        data: {
          url,
          publicId,
          orden,
          tipo,
          tareaId: id,
        },
      });

      if (hermanas.length > 0) {
        for (const hermana of hermanas) {
          const count = await tx.tareaImagen.count({
            where: { tareaId: hermana.id, tipo }
          });
          if (count < 3) {
            await tx.tareaImagen.create({
              data: {
                url,
                publicId,
                orden: count + 1,
                tipo,
                tareaId: hermana.id
              }
            });
          }
        }
      }

      return mainImg;
    });

    await registrarAccion(
      "ADD_IMAGEN_TAREA",
      usuarioId,
      `Imagen de tipo ${tipo} agregada a entrada ${id} ${hermanas.length > 0 ? `y propagada a ${hermanas.length} hermanas` : ''}`
    );

    return res.status(201).json({
      status: "success",
      data: imagen,
    });
  } catch (error) {
    await registrarError("ADD_IMAGEN_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al agregar imagen" });
  }
};

export const deleteImagenTarea = async (
  req: Request,
  res: Response
) => {
  try {
    const usuarioId = req.user!.id;
    const { id, imagenId } = req.params as unknown as ImagenIdParams;

    const imagen = await prisma.tareaImagen.findUnique({
      where: { id: imagenId },
    });

    if (!imagen || imagen.tareaId !== id) {
      return res.status(404).json({ error: "Imagen no encontrada" });
    }

    // Find all task image records sharing this publicId (affects all sister tasks in a group)
    const matchingImages = await prisma.tareaImagen.findMany({
      where: { publicId: imagen.publicId },
      select: { id: true, tareaId: true }
    });
    
    const taskIds = Array.from(new Set(matchingImages.map(img => img.tareaId)));

    // Delete image from Cloudinary
    await deleteImageByPublicId(imagen.publicId);

    // Delete all database records and reorder remaining images for each affected task
    await prisma.$transaction(async (tx) => {
      await tx.tareaImagen.deleteMany({
        where: { publicId: imagen.publicId },
      });

      // Reorder remaining images of the same type for all affected tasks to prevent sequence gaps
      for (const tId of taskIds) {
        const restantes = await tx.tareaImagen.findMany({
          where: { 
            tareaId: tId,
            tipo: imagen.tipo
          },
          orderBy: { orden: "asc" },
        });

        for (let i = 0; i < restantes.length; i++) {
          await tx.tareaImagen.update({
            where: { id: restantes[i]!.id },
            data: { orden: i + 1 },
          });
        }
      }
    });

    await registrarAccion(
      "DELETE_IMAGEN_TAREA",
      usuarioId,
      `Imagen ${imagenId} (tipo ${imagen.tipo}) eliminada de entrada ${id} y sus hermanas si aplica`
    );

    return res.json({
      status: "success",
      message: "Imagen eliminada correctamente",
    });
  } catch (error) {
    await registrarError("DELETE_IMAGEN_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al eliminar imagen" });
  }
};