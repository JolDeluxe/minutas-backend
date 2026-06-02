import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { uploadTaskImage } from "../../utils/cloudinary";

const prisma = new PrismaClient();

export const uploadBorradorImagen = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, error: "No image provided" });
            return;
        }

        const cldRes = await uploadTaskImage(req.file.buffer, req.file.mimetype);

        res.status(200).json({
            success: true,
            url: cldRes.url,
        });
    } catch (error) {
        console.error("Error al subir imagen de borrador:", error);
        res.status(500).json({
            success: false,
            error: "Error interno al subir la imagen",
        });
    }
};
