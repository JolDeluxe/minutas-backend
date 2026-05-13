import { v2 as cloudinary } from "cloudinary";
import { env } from "../env";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
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

// --- FUNCIONES NUEVAS: Para Tareas y Minutas ---
export const uploadTaskImage = async (
  buffer: Buffer
): Promise<{ url: string; publicId: string }> => {
  // Detectar formato básico (fallback a jpeg)
  const b64 = buffer.toString("base64");
  const dataUri = `data:image/jpeg;base64,${b64}`; // Cloudinary suele detectar el formato real del buffer automáticamente

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "minutas-diseño/imagenes", // <-- Carpeta segmentada
    resource_type: "image",
    transformation: [
      { width: 1280, crop: "limit" },
      { quality: "auto:good" },
      { fetch_format: "auto" },
    ],
  });

  return { url: result.secure_url, publicId: result.public_id };
};

export const uploadPdfDocument = async (buffer: Buffer, filename: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "minutas-diseño/pdf", // <-- Carpeta segmentada
        resource_type: "image", // "image" permite previsualizar PDFs en el navegador
        public_id: filename,
        format: "pdf"
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