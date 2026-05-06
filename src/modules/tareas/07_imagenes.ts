import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarAccion, registrarError } from "../../utils/logger";
import { uploadTaskImage, deleteImageByPublicId } from "../../utils/cloudinary";
import type { TareaIdParams, ImagenIdParams } from "./zod";

export const addImagenTarea = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const { id }    = req.params as unknown as TareaIdParams;

    const tarea = await prisma.tarea.findUnique({
      where: { id },
      include: { imagenes: true },
    });

    if (!tarea) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    if (tarea.imagenes.length >= 3) {
      return res.status(400).json({ error: "Máximo 3 imágenes por tarea" });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No se proporcionó ninguna imagen" });
    }

    const { url, publicId } = await uploadTaskImage(file.buffer);
    const orden = tarea.imagenes.length + 1;

    const imagen = await prisma.tareaImagen.create({
      data: { url, publicId, orden, tareaId: id },
    });

    await registrarAccion("AGREGAR_IMAGEN_TAREA", usuarioId, `Tarea ID ${id}`);

    return res.status(201).json({ status: "success", data: imagen });
  } catch (error) {
    await registrarError("AGREGAR_IMAGEN_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al agregar imagen" });
  }
};

export const deleteImagenTarea = async (req: Request, res: Response) => {
  try {
    const usuarioId        = req.user!.id;
    const { id, imagenId } = req.params as unknown as ImagenIdParams;

    const imagen = await prisma.tareaImagen.findUnique({ where: { id: imagenId } });

    if (!imagen || imagen.tareaId !== id) {
      return res.status(404).json({ error: "Imagen no encontrada" });
    }

    await deleteImageByPublicId(imagen.publicId);
    await prisma.tareaImagen.delete({ where: { id: imagenId } });

    // Reordenar las imágenes restantes
    const restantes = await prisma.tareaImagen.findMany({
      where:   { tareaId: id },
      orderBy: { orden: "asc" },
    });

    await Promise.all(
      restantes.map((img, i) =>
        prisma.tareaImagen.update({ where: { id: img.id }, data: { orden: i + 1 } })
      )
    );

    await registrarAccion("ELIMINAR_IMAGEN_TAREA", usuarioId, `Tarea ID ${id}, Imagen ID ${imagenId}`);

    return res.json({ status: "success", message: "Imagen eliminada correctamente" });
  } catch (error) {
    await registrarError("ELIMINAR_IMAGEN_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al eliminar imagen" });
  }
};