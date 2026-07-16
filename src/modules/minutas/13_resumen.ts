// minutas-backend/src/modules/minutas/13_resumen.ts
/**
 * Módulo de Resumen de Minuta (Edición Manual).
 *
 * Expone un único handler:
 *  - guardarResumen    → PUT /:id/resumen
 *    Actualiza manualmente las secciones del resumen. Restringido solo al Administrador.
 */

import type { Request, Response } from "express";
import { prisma } from "../../db";
import { registrarError } from "../../utils/logger";
import { deleteImageByPublicId } from "../../utils/cloudinary";

export const guardarResumen = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const minutaId = Number(id);

    if (!minutaId || isNaN(minutaId)) {
      return res.status(400).json({ error: "ID de minuta inválido" });
    }

    const {
      resumenTemas,
      resumenAcuerdos,
      resumenProximosPasos,
      imagenUrl1,
      publicId1,
      imagenUrl2,
      publicId2,
      imagenUrl3,
      publicId3
    } = req.body as {
      resumenTemas?: string;
      resumenAcuerdos?: string;
      resumenProximosPasos?: string;
      imagenUrl1?: string | null;
      publicId1?: string | null;
      imagenUrl2?: string | null;
      publicId2?: string | null;
      imagenUrl3?: string | null;
      publicId3?: string | null;
    };

    // Verificar que la minuta existe
    const minuta = await prisma.minuta.findUnique({
      where: { id: minutaId },
      select: {
        id: true,
        publicId1: true,
        publicId2: true,
        publicId3: true,
      },
    });

    if (!minuta) {
      return res.status(404).json({ error: "Minuta no encontrada" });
    }

    // Restricción estricta: Solo el Administrador puede editar el resumen
    const usuario = req.user!;
    if (usuario.rol !== "ADMIN") {
      return res.status(403).json({ error: "Solo el Administrador puede editar el resumen de la minuta" });
    }

    const data: Record<string, any> = {};
    if (resumenTemas !== undefined) data.resumenTemas = resumenTemas;
    if (resumenAcuerdos !== undefined) data.resumenAcuerdos = resumenAcuerdos;
    if (resumenProximosPasos !== undefined) data.resumenProximosPasos = resumenProximosPasos;

    // Control de imágenes y borrado de Cloudinary cuando se limpian o reemplazan
    if (imagenUrl1 !== undefined) data.imagenUrl1 = imagenUrl1;
    if (publicId1 !== undefined) {
      data.publicId1 = publicId1;
      if (publicId1 !== minuta.publicId1 && minuta.publicId1) {
        await deleteImageByPublicId(minuta.publicId1);
      }
    }

    if (imagenUrl2 !== undefined) data.imagenUrl2 = imagenUrl2;
    if (publicId2 !== undefined) {
      data.publicId2 = publicId2;
      if (publicId2 !== minuta.publicId2 && minuta.publicId2) {
        await deleteImageByPublicId(minuta.publicId2);
      }
    }

    if (imagenUrl3 !== undefined) data.imagenUrl3 = imagenUrl3;
    if (publicId3 !== undefined) {
      data.publicId3 = publicId3;
      if (publicId3 !== minuta.publicId3 && minuta.publicId3) {
        await deleteImageByPublicId(minuta.publicId3);
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No se enviaron campos a actualizar" });
    }

    const minutaActualizada = await prisma.minuta.update({
      where: { id: minutaId },
      data,
    });

    return res.json({
      status: "success",
      data: {
        resumenTemas: minutaActualizada.resumenTemas,
        resumenAcuerdos: minutaActualizada.resumenAcuerdos,
        resumenProximosPasos: minutaActualizada.resumenProximosPasos,
        imagenUrl1: minutaActualizada.imagenUrl1,
        publicId1: minutaActualizada.publicId1,
        imagenUrl2: minutaActualizada.imagenUrl2,
        publicId2: minutaActualizada.publicId2,
        imagenUrl3: minutaActualizada.imagenUrl3,
        publicId3: minutaActualizada.publicId3,
      },
    });
  } catch (error) {
    await registrarError("GUARDAR_RESUMEN", req.user?.id ?? null, error);
    return res.status(500).json({ error: "Error al guardar el resumen" });
  }
};
