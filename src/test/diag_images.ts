import { prisma } from "../db";

async function main() {
  const count = await prisma.tareaImagen.count({
    where: { url: { contains: "5005" } }
  });
  console.log("=== CONTEO 5005 EN TareaImagen ===", count);

  const samples = await prisma.tareaImagen.findMany({
    where: { url: { contains: "5005" } },
    take: 5,
    select: { id: true, url: true, publicId: true, createdAt: true, tareaId: true }
  });
  console.log("=== MUESTRAS ===", JSON.stringify(samples, null, 2));

  const totalImagenes = await prisma.tareaImagen.count();
  console.log("=== TOTAL EN TareaImagen ===", totalImagenes);

  const placeholders = await prisma.tareaImagen.count({
    where: { publicId: "local/no-image" }
  });
  console.log("=== TOTAL PLACEHOLDERS (local/no-image) ===", placeholders);

  // Buscar en otras tablas
  const bitacoraCron = await prisma.bitacora.findMany({
    where: { accion: { contains: "CRON" } },
    take: 5,
    orderBy: { createdAt: "desc" }
  });
  console.log("=== BITACORA CRON ===", JSON.stringify(bitacoraCron, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
