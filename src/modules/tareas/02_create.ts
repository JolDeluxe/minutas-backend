import type { Request, Response } from "express";
import { prisma } from "../../db";
import { Area, Linea, Prioridad, Clasificacion } from "@prisma/client";
import { registrarAccion, registrarError } from "../../utils/logger";
import { uploadTaskImage } from "../../utils/cloudinary";
import { calcularIsExternalArea, calcularCapturaCompleta } from "./helpers";
import { getIO } from "../../utils/socket"; 
import type { CreateTareaInput } from "./zod";

export const crearTarea = async (req: Request, res: Response) => {
  try {
    const usuarioId = req.user!.id;
    // Zod ya lo parseó y validó como Array
    const tareasPayload = req.body.tareas as CreateTareaInput[]; 

    const minutaId = tareasPayload[0]?.minutaId;
    if (minutaId) {
      const minuta = await prisma.minuta.findUnique({ where: { id: minutaId } });
      if (!minuta) return res.status(404).json({ error: "Minuta no encontrada" });
    }

    const files = req.files as Express.Multer.File[] | undefined;
    const tareasCompletasResp: any[] = [];

    for (let index = 0; index < tareasPayload.length; index++) {
      const tareaInput = tareasPayload[index];
      
      if (!tareaInput) continue;

      const isExternalArea = calcularIsExternalArea(tareaInput.area as Area | undefined);
      const fechaVenc = tareaInput.fechaVencimiento ? new Date(tareaInput.fechaVencimiento) : null;

      const archivosDeEstaTarea = files?.filter(f => f.fieldname.startsWith(`imagen_tarea_${index}_`)) || [];
      const imagenesData: { url: string; publicId: string; orden: number }[] = [];

      if (archivosDeEstaTarea.length > 0) {
        for (let i = 0; i < Math.min(archivosDeEstaTarea.length, 3); i++) {
          const file = archivosDeEstaTarea[i];
          if (!file) continue;
          const { url, publicId } = await uploadTaskImage(file.buffer);
          imagenesData.push({ url, publicId, orden: i + 1 });
        }
      }

      const tareaId = await prisma.$transaction(async (tx) => {
        const nueva = await tx.tarea.create({
          data: {
            descripcion:     tareaInput.descripcion,
            creadoPorId:     usuarioId,
            minutaId:        tareaInput.minutaId ?? null,
            area:            tareaInput.area as Area | undefined,
            prioridad:       tareaInput.prioridad as Prioridad | undefined,
            linea:           tareaInput.linea as Linea | undefined,
            clasificacion:   tareaInput.clasificacion as Clasificacion | undefined,
            fechaVencimiento: fechaVenc,
            isExternalArea,
            imagenes: { create: imagenesData },
            // <-- SE GUARDAN LOS ANEXOS EN LA CREACIÓN
            notas: tareaInput.notas && tareaInput.notas.length > 0 
              ? { create: tareaInput.notas.map(n => ({ contenido: n.contenido })) } 
              : undefined,
          },
        });

        if (tareaInput.responsables && tareaInput.responsables.length > 0) {
          await tx.tareaAsignacion.createMany({
            data: tareaInput.responsables.map((uid) => ({ tareaId: nueva.id, usuarioId: uid })),
            skipDuplicates: true,
          });
        }

        const nuevaCapturaCompleta = calcularCapturaCompleta({
          clasificacion:     nueva.clasificacion,
          fechaVencimiento:  nueva.fechaVencimiento,
          totalAsignaciones: tareaInput.responsables?.length ?? 0,
        });

        if (nuevaCapturaCompleta) {
          await tx.tarea.update({ where: { id: nueva.id }, data: { capturaCompleta: true } });
        }

        return nueva.id;
      });

      const tareaCompleta = await prisma.tarea.findUnique({
        where: { id: tareaId },
        include: {
          imagenes:     { orderBy: { orden: "asc" } },
          asignaciones: { include: { usuario: { select: { id: true, nombre: true, username: true, imagen: true } } } },
          creadoPor:    { select: { id: true, nombre: true, username: true } },
          minuta:       { select: { id: true, titulo: true, estado: true } },
          notas:        { orderBy: { createdAt: "desc" } } // <-- SE INCLUYEN AL RESPONDER
        },
      });

      tareasCompletasResp.push(tareaCompleta);
    }

    await registrarAccion("CREAR_TAREA_MASIVA", usuarioId, `Se crearon ${tareasPayload.length} tareas (minuta: ${minutaId ?? "sin minuta"})`);

    try {
      getIO().to("global_updates").emit("nuevas_tareas_creadas", { 
        minutaId, 
        cantidad: tareasPayload.length,
        tareas: tareasCompletasResp.map(t => ({ id: t.id, linea: t.linea, area: t.area }))
      });
    } catch (_) {}

    return res.status(201).json({ status: "success", data: tareasCompletasResp });
  } catch (error) {
    await registrarError("CREAR_TAREA", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al crear las tareas" });
  }
};