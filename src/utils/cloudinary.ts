import { v2 as cloudinary } from "cloudinary";
import { env } from "../env";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

export const uploadUserProfileImage = async (buffer: Buffer): Promise<string> => {
  const dataUri = `data:image/jpeg;base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "TRACE/Usuarios",
    resource_type: "image",
    transformation: [
      { width: 500, height: 500, crop: "thumb", gravity: "face" },
      { quality: "auto:good" },
      { fetch_format: "auto" },
    ],
  });

  return result.secure_url;
};

export const uploadTaskImage = async (
  buffer: Buffer
): Promise<{ url: string; publicId: string }> => {
  const dataUri = `data:image/jpeg;base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "TRACE/Tareas",
    resource_type: "image",
    transformation: [
      { width: 1280, crop: "limit" },
      { quality: "auto:good" },
      { fetch_format: "auto" },
    ],
  });

  return { url: result.secure_url, publicId: result.public_id };
};

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