import type { Request, Response } from "express";
import { EstadoTarea, TipoEntrada, Area } from "@prisma/client";
import { prisma } from "../../db";
import { getIO, liveDraftRooms } from "../../utils/socket";

type ConsolidatedImage = {
    url: string;
    publicId: string;
    orden: number;
    tipo: "CAPTURA";
};

const extractCloudinaryPublicId = (url: string): string | null => {
    if (!url || !url.includes("/upload/")) return null;
    const [, uploadedPath] = url.split("/upload/");
    if (!uploadedPath) return null;
    return uploadedPath.replace(/^v\d+\//, "").replace(/\.[^/.]+$/, "");
};

const buildImagenesCreate = (images: any[] | undefined): ConsolidatedImage[] => {
    return (images ?? [])
        .map((img: any, index: number) => {
            const url = img?.url ?? img?.secure_url;
            const publicId = img?.publicId ?? img?.public_id ?? extractCloudinaryPublicId(url);

            if (!url || !publicId) return null;

            return {
                url,
                publicId,
                orden: index + 1,
                tipo: "CAPTURA",
            };
        })
        .filter((img): img is ConsolidatedImage => img !== null)
        .slice(0, 3);
};

export const consolidarBorradores = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params; // minutaId
    const minutaId = Number(id);

    try {
        const key = String(minutaId);
        const room = liveDraftRooms.get(key);
        
        if (!room || room.entries.size === 0) {
            res.status(200).json({
                status: "success",
                message: "No hay borradores para consolidar",
                data: { count: 0 },
            });
            return;
        }

        const usuarioId = req.user?.id;
        if (!usuarioId) {
            res.status(401).json({ status: "error", message: "No autorizado" });
            return;
        }

        const draftEntries = Array.from(room.entries.values());

        // Transformar borradores al esquema de Prisma
        const tareasACrear = draftEntries.map((draft: any) => {
            const data = draft.tareas?.[0] || draft;
            const draftAuthorId = draft.author?.id ? Number(draft.author.id) : null;
            const finalCreadoPorId = (draftAuthorId && !isNaN(draftAuthorId)) ? draftAuthorId : usuarioId;
            
            return {
                minutaId: minutaId,
                descripcion: data.descripcion || "",
                area: (data.area || "DISENO") as Area,
                linea: data.linea || null,
                clasificacion: data.clasificacion || "OTROS",
                tipo: (["SIN_ORGANIZAR", "TAREA", "RECORDATORIO", "POLITICA", "DESCARTADA"].includes(data.tipo) ? data.tipo : "SIN_ORGANIZAR") as TipoEntrada,
                estado: data.tipo === "TAREA" ? EstadoTarea.PENDIENTE : null,
                creadoPorId: finalCreadoPorId,
                // Procesamiento de imágenes (ya subidas y seguras)
                imagenes: {
                    create: buildImagenesCreate(data._localImages),
                },
                // Procesamiento de notas
                notas: {
                    create: data.notas?.map((nota: any) => ({
                        contenido: nota.contenido,
                        creadoPorId: finalCreadoPorId
                    })) || []
                }
            };
        });

        // Ejecutar en Transacción
        await prisma.$transaction(
            tareasACrear.map(tarea => prisma.tarea.create({
                data: tarea
            }))
        );

        // Limpiar la memoria ram del servidor
        liveDraftRooms.delete(key);

        // Avisar a todos los clientes que la minuta fue consolidada
        getIO().to(`minuta_${minutaId}`).emit("minuta:drafts_consolidated", {
            minutaId
        });

        res.status(200).json({
            status: "success",
            message: "Borradores consolidados exitosamente",
            data: { count: tareasACrear.length },
        });

    } catch (error) {
        console.error("Error al consolidar borradores:", error);
        res.status(500).json({
            status: "error",
            message: "Error interno al consolidar",
        });
    }
};
