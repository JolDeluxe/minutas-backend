import { v2 as cloudinary } from "cloudinary";
import { env } from "../env";

// Eliminar variable de entorno global CLOUDINARY_URL si existiese en el sistema,
// para evitar que sobrescriba o interfiera con las credenciales explícitas configuradas abajo.
if (process.env.CLOUDINARY_URL) {
  console.log(`[Cloudinary Init] Detectado process.env.CLOUDINARY_URL. Eliminando de la memoria para evitar interferencia de firmas.`);
  delete process.env.CLOUDINARY_URL;
}

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

// --- Para las fotos de perfil de usuario ---
export const uploadUserProfileImage = async (
  buffer: Buffer,
  mimetype?: string,
  filename?: string
): Promise<string> => {
  const isHeic = /\.(heic|heif)$/i.test(filename || "") || mimetype === "image/heic" || mimetype === "image/heif";
  
  // Determinar MIME type adecuado para el Data URI
  const actualMime = isHeic ? "image/heic" : (mimetype || "image/jpeg");
  const dataUri = `data:${actualMime};base64,${buffer.toString("base64")}`;

  const options: any = {
    folder: "TRACE/Usuarios",
    resource_type: "auto",
  };

  if (isHeic) {
    console.log(`[Cloudinary] Detectada imagen HEIC/HEIF de perfil. Procesando nativamente por Base64...`);
  }

  try {
    const result = await cloudinary.uploader.upload(dataUri, options);
    
    // Generar URL optimizada en tiempo de entrega (delivery)
    const optimizedUrl = cloudinary.url(result.public_id, {
      secure: true,
      width: 500,
      height: 500,
      crop: "thumb",
      gravity: "face",
      quality: "auto:good",
      fetch_format: "auto"
    });
    
    return optimizedUrl;
  } catch (error) {
    console.error(`[Cloudinary] Error en uploadUserProfileImage (Base64):`, error);
    throw error;
  }
};

// --- Para las imágenes adjuntas a las tareas ---
export const uploadTaskImage = async (
  buffer: Buffer,
  mimetype: string = "image/jpeg",
  filename?: string
): Promise<{ url: string; publicId: string }> => {
  console.log(`[Cloudinary] Iniciando subida por uploader.upload (Base64), tamaño buffer: ${buffer.length} bytes (mimetype: ${mimetype}, filename: ${filename || 'ninguno'})`);
  
  const isHeic = /\.(heic|heif)$/i.test(filename || "") || mimetype === "image/heic" || mimetype === "image/heif";
  
  // Si la petición viene como application/octet-stream pero sabemos que es imagen por la extensión o es HEIC
  let actualMime = mimetype;
  if (mimetype === "application/octet-stream" && filename) {
    if (/\.heic$/i.test(filename)) actualMime = "image/heic";
    else if (/\.heif$/i.test(filename)) actualMime = "image/heif";
    else if (/\.(jpg|jpeg)$/i.test(filename)) actualMime = "image/jpeg";
    else if (/\.png$/i.test(filename)) actualMime = "image/png";
    else if (/\.webp$/i.test(filename)) actualMime = "image/webp";
  }
  
  const dataUri = `data:${actualMime};base64,${buffer.toString("base64")}`;

  const options: any = {
    folder: "minutas-diseño/imagenes",
    resource_type: "auto",
  };

  if (isHeic) {
    console.log(`[Cloudinary] Detectada imagen HEIC/HEIF. Procesando nativamente...`);
  }

  try {
    const result = await cloudinary.uploader.upload(dataUri, options);
    
    // Generar URL optimizada en tiempo de entrega
    const optimizedUrl = cloudinary.url(result.public_id, {
      secure: true,
      width: 1280,
      crop: "limit",
      quality: "auto:eco",
      fetch_format: "auto"
    });
    
    console.log(`[Cloudinary] Upload exitoso. URL generada: ${optimizedUrl}`);
    return { url: optimizedUrl, publicId: result.public_id };
  } catch (error) {
    console.error(`[Cloudinary] Error en uploadTaskImage (Base64):`, error);
    throw error;
  }
};

// --- Para los documentos PDF ---
export const uploadPdfDocument = async (buffer: Buffer, filename: string): Promise<string> => {
  const pdfFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  console.log(`[Cloudinary] Subiendo PDF por uploader.upload (Base64): ${pdfFilename}`);
  
  const dataUri = `data:application/pdf;base64,${buffer.toString("base64")}`;

  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "minutas-diseño/pdf",
      resource_type: "raw",
      public_id: pdfFilename,
    });
    return result.secure_url;
  } catch (error) {
    console.error(`[Cloudinary] Error en uploadPdfDocument (Base64):`, error);
    throw error;
  }
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