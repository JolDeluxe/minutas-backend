import { prisma } from "../db";

async function main() {
  console.log("🔍 Buscando minutas registradas...");
  const minutas = await prisma.minuta.findMany({
    include: {
      creadoPor: true,
    },
  });

  console.log(`📊 Se encontraron ${minutas.length} minutas totales.`);
  let modificadas = 0;

  for (const minuta of minutas) {
    const creadorDepto = minuta.creadoPor?.departamento;
    
    if (creadorDepto && minuta.departamento !== creadorDepto) {
      console.log(
        `✏️  Actualizando Minuta #${minuta.id} ("${minuta.titulo}"): ${minuta.departamento} ➡️  ${creadorDepto}`
      );
      await prisma.minuta.update({
        where: { id: minuta.id },
        data: { departamento: creadorDepto },
      });
      modificadas++;
    }
  }

  console.log(`✅ ¡Proceso completado! Se actualizaron ${modificadas} minutas.`);
}

main()
  .catch((e) => {
    console.error("❌ Error al corregir las minutas:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
