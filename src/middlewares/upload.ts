import multer from "multer";

const storage = multer.memoryStorage();

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 30 * 1024 * 1024, // Aumentado a 30MB por seguridad
  },
  fileFilter: (_req, file, cb) => {
    const isImageMime = file.mimetype.startsWith("image/");
    const isImageExt = /\.(heic|heif|jpg|jpeg|png|webp|gif|svg)$/i.test(file.originalname);

    if (isImageMime || isImageExt) {
      // Si pasa por extensión pero tiene un mimetype genérico, normalizarlo
      if (!isImageMime && /\.(heic|heif)$/i.test(file.originalname)) {
        file.mimetype = "image/heic";
      }
      console.log(`[FileFilter] Archivo aceptado: ${file.originalname} (${file.mimetype})`);
      cb(null, true);
    } else {
      console.warn(`[FileFilter] Archivo rechazado: ${file.originalname} (tipo no permitido: ${file.mimetype})`);
      cb(new Error("Solo se permiten archivos de imagen (JPEG, PNG, WEBP, HEIC)"));
    }
  },
});