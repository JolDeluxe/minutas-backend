import { v2 as cloudinary } from "cloudinary";
import { env } from "../env";

// --- DIAGNÓSTICO DE CREDENCIALES ---
console.log(`[Cloudinary Config] Cloud Name: ${env.CLOUDINARY_CLOUD_NAME ? 'OK' : '¡NO ENCONTRADO!'}`);
console.log(`[Cloudinary Config] API Key: ${env.CLOUDINARY_API_KEY ? 'OK' : '¡NO ENCONTRADO!'}`);
console.log(`[Cloudinary Config] API Secret: ${env.CLOUDINARY_API_SECRET ? 'OK' : '¡NO ENCONTRADO!'}`);
// ------------------------------------

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true, // Forzar URLs HTTPS
});

// --- FUNCIÓN RECUPERADA: Para las fotos de perfil de usuario ---
export const uploadUserProfileImage = async (buffer: Buffer): Promise<string> => {
  const dataUri = `data:image/jpeg;base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "TRACE/Usuarios", // Lo dejo en su carpeta original, o cámbialo si lo deseas
    resource_type: "image",
    transformation: [
      { width: 500, height: 500, crop: "thumb", gravity: "face" },
      { quality: "auto:good" },
      { fetch_format: "auto" },
    ],
  });

  return result.secure_url;
};

// ── FIX: Usa upload_stream (igual que uploadPdfDocument) ──────────────────────
// El método upload() con data URI falla en Bun con imágenes no-JPEG.
// upload_stream es más robusto y detecta el formato real del buffer.
export const uploadTaskImage = async (
  buffer: Buffer,
  mimetype: string = "image/jpeg"
): Promise<{ url: string; publicId: string }> => {
  return new Promise((resolve, reject) => {
    console.log(`[Cloudinary] Iniciando upload_stream, tamaño buffer: ${buffer.length} bytes`);
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "minutas-diseño/imagenes",
        resource_type: "image",
        transformation: [
          { width: 1280, crop: "limit" },
          { quality: "auto:eco" }, // Mayor compresión para rendimiento móvil
          { fetch_format: "auto" },
        ],
      },
      (error, result) => {
        if (error || !result) {
          console.error(`[Cloudinary] Error en upload_stream:`, error);
          return reject(
            error ?? new Error("Cloudinary upload_stream: sin resultado")
          );
        }
        console.log(`[Cloudinary] Upload exitoso: ${result.secure_url}`);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    uploadStream.end(buffer);
  });
};


export const uploadPdfDocument = async (buffer: Buffer, filename: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Para evitar el error 401 (Unauthorized) por restricciones de seguridad de Cloudinary
    // para PDFs tipo "image", subimos el documento como recurso "raw".
    const pdfFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "minutas-diseño/pdf",
        resource_type: "raw",
        public_id: pdfFilename,
      },
      (error, result) => {
        if (error || !result) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

// --- ELIMINACIÓN DE ARCHIVOS ---
export const deleteImageByPublicId = async (publicId: string): Promise<void> => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("[Cloudinary] Error al eliminar imagen:", error);
  }
};

export const deleteImageByUrl = async (imageUrl: string): Promise<void> => {
  if (!imageUrl || !imageUrl.includes("cloudinary")) return;
  try {
    const parts = imageUrl.split("/upload/");
    const extract = parts[1];
    if (!extract) return;
    const publicId = extract.replace(/^v\d+\//, "").replace(/\.[^/.]+$/, "");
    if (publicId) await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("[Cloudinary] Error al eliminar imagen por URL:", error);
  }
};