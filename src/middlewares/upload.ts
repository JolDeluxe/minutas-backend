import multer from "multer";

const storage = multer.memoryStorage();

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 30 * 1024 * 1024, // Aumentado a 30MB por seguridad
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      console.log(`[FileFilter] Archivo aceptado: ${file.originalname} (${file.mimetype})`);
      cb(null, true);
    } else {
      console.warn(`[FileFilter] Archivo rechazado: ${file.originalname} (tipo no permitido: ${file.mimetype})`);
      cb(new Error("Solo se permiten archivos de imagen"));
    }
  },
});