import type { Request, Response } from "express";
import { uploadTaskImage } from "../../utils/cloudinary";

export const uploadBorradorImagen = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ status: "error", message: "No image provided" });
            return;
        }

        const cldRes = await uploadTaskImage(req.file.buffer, req.file.mimetype, req.file.originalname);

        res.status(200).json({
            status: "success",
            url: cldRes.url,
            publicId: cldRes.publicId,
        });
    } catch (error) {
        console.error("Error al subir imagen de borrador:", error);
        res.status(500).json({
            status: "error",
            message: "Error interno al subir la imagen",
        });
    }
};
