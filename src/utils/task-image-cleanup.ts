import { prisma } from "../db";
import { env } from "../env";
import { deleteImageByPublicId } from "./cloudinary";

const PLACEHOLDER_PUBLIC_ID = "local/no-image";
const PLACEHOLDER_PATH = "/img/no-image.avif";
const DEFAULT_BATCH_SIZE = 200;

const getPlaceholderUrl = (): string => {
  const baseUrl = env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT}`;
  return `${baseUrl.replace(/\/$/, "")}${PLACEHOLDER_PATH}`;
};

const getOlderThanDate = (months: number): Date => {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
};

export const cleanupOldTaskImages = async (
  months = 3,
  batchSize = DEFAULT_BATCH_SIZE
): Promise<{ processed: number; replaced: number; errors: number }> => {
  const cutoff = getOlderThanDate(months);
  const placeholderUrl = getPlaceholderUrl();

  const oldImages = await prisma.tareaImagen.findMany({
    where: {
      createdAt: { lt: cutoff },
      publicId: { not: PLACEHOLDER_PUBLIC_ID },
      NOT: {
        url: { contains: PLACEHOLDER_PATH },
      },
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
    select: {
      id: true,
      publicId: true,
    },
  });

  let replaced = 0;
  let errors = 0;

  for (const image of oldImages) {
    try {
      await deleteImageByPublicId(image.publicId);

      await prisma.tareaImagen.update({
        where: { id: image.id },
        data: {
          url: placeholderUrl,
          publicId: PLACEHOLDER_PUBLIC_ID,
        },
      });

      replaced++;
    } catch (error) {
      errors++;
      console.error(`[TaskImageCleanup] Error limpiando imagen ${image.id}:`, error);
    }
  }

  return {
    processed: oldImages.length,
    replaced,
    errors,
  };
};
