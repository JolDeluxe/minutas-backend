import type { Request, Response } from "express";
import { PrismaClient, EstadoTarea, TipoEntrada, Area } from "@prisma/client";
import { getIO } from "../../utils/socket";

const prisma = new PrismaClient();

// Necesitamos importar el mapa de memoria de sockets si no está expuesto.
// Como liveDraftRooms está en socket.ts y no es exportado directamente, 
// podríamos necesitar acceder al store o emitir un evento que lo limpie,
// o modificar socket.ts para exportar un getter.
import { liveDraftRooms } from "../../utils/socket";

export const consolidarBorradores = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params; // minutaId
    const minutaId = Number(id);

    try {
        const key = String(minutaId);
        const room = liveDraftRooms.get(key);
        
        if (!room || room.entries.size === 0) {
            res.status(200).json({ success: true, message: "No hay borradores para consolidar", count: 0 });
            return;
        }

        const usuarioId = req.user?.id;
        if (!usuarioId) {
            res.status(401).json({ success: false, error: "No autorizado" });
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
                estado: EstadoTarea.PENDIENTE,
                creadoPorId: finalCreadoPorId,
                // Procesamiento de imágenes (ya subidas y seguras)
                imagenes: {
                    create: data._localImages
                        ?.filter((img: any) => img.secure_url) // Solo las que se subieron con éxito
                        ?.map((img: any) => ({ url: img.secure_url })) || []
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
            success: true,
            count: tareasACrear.length,
            message: "Borradores consolidados exitosamente"
        });

    } catch (error) {
        console.error("Error al consolidar borradores:", error);
        res.status(500).json({
            success: false,
            error: "Error interno al consolidar"
        });
    }
};
