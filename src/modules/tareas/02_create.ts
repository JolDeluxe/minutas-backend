import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Area, Linea, Prioridad, Clasificacion } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { uploadTaskImage } from "../../utils/cloudinary";
import { calcularIsExternalArea, calcularCapturaCompleta } from "./helpers";
import type { CreateTareaInput } from "./zod";

export const crearTarea = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    const {
      descripcion, minutaId, area, prioridad, linea,
      clasificacion, fechaVencimiento, responsables,
    } = req.body as CreateTareaInput;

    if (minutaId) {
      const minuta = await prisma.minuta.findUnique({ where: { id: minutaId } });
      if (!minuta) return res.status(404).json({ error: "Minuta no encontrada" });
    }

    const isExternalArea = calcularIsExternalArea(area as Area | undefined);
    const fechaVenc      = fechaVencimiento ? new Date(fechaVencimiento) : null;

    // Subir imágenes si las hay (hasta 3)
    const files = req.files as Express.Multer.File[] | undefined;
    const imagenesData: { url: string; publicId: string; orden: number }[] = [];

    if (files && files.length > 0) {
      for (let i = 0; i < Math.min(files.length, 3); i++) {
        const file = files[i];
        if (!file) continue;
        const { url, publicId } = await uploadTaskImage(file.buffer);
        imagenesData.push({ url, publicId, orden: i + 1 });
      }
    }

    const tareaId = await prisma.$transaction(async (tx) => {
      const nueva = await tx.tarea.create({
        data: {
          descripcion,
          creadoPorId:     usuarioId,
          minutaId:        minutaId  ?? null,
          area:            area      as Area        | undefined,
          prioridad:       prioridad as Prioridad   | undefined,
          linea:           linea     as Linea       | undefined,
          clasificacion:   clasificacion as Clasificacion | undefined,
          fechaVencimiento: fechaVenc,
          isExternalArea,
          imagenes: { create: imagenesData },
        },
      });

      if (responsables && responsables.length > 0) {
        await tx.tareaAsignacion.createMany({
          data: responsables.map((uid) => ({ tareaId: nueva.id, usuarioId: uid })),
          skipDuplicates: true,
        });
      }

      const nuevaCapturaCompleta = calcularCapturaCompleta({
        clasificacion:     nueva.clasificacion,
        fechaVencimiento:  nueva.fechaVencimiento,
        totalAsignaciones: responsables?.length ?? 0,
      });

      if (nuevaCapturaCompleta) {
        await tx.tarea.update({ where: { id: nueva.id }, data: { capturaCompleta: true } });
      }

      return nueva.id;
    });

    await registrarAccion("CREAR_TAREA", usuarioId, `Tarea ID ${tareaId} (minuta: ${minutaId ?? "sin minuta"})`);

    const tareaCompleta = await prisma.tarea.findUnique({
      where: { id: tareaId },
      include: {
        imagenes:     { orderBy: { orden: "asc" } },
        asignaciones: { include: { usuario: { select: { id: true, nombre: true, username: true, imagen: true } } } },
        creadoPor:    { select: { id: true, nombre: true, username: true } },
        minuta:       { select: { id: true, titulo: true, estado: true } },
      },
    });

    return res.status(201).json({ status: "success", data: tareaCompleta });
  } catch (error) {
    await registrarError("CREAR_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al crear tarea" });
  }
};