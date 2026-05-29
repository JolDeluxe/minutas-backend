import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const minutaId = 19;
  const minuta = await prisma.minuta.findUnique({
    where: { id: minutaId },
    include: {
      tareas: {
        select: {
          id: true,
          descripcion: true,
          tipo: true,
          estado: true,
          area: true,
          departamento: true
        }
      }
    }
  });

  if (!minuta) {
    console.log(`Minuta ${minutaId} no encontrada`);
    return;
  }

  console.log('--- MINUTA ---');
  console.log(`ID: ${minuta.id}`);
  console.log(`Titulo: ${minuta.titulo}`);
  console.log(`Estado: ${minuta.estado}`);
  console.log(`Departamento: ${minuta.departamento}`);
  console.log(`Cerrado At: ${minuta.cerradoAt}`);
  console.log(`Cerrado Por ID: ${minuta.cerradoPorId}`);

  console.log('\n--- TAREAS ---');
  minuta.tareas.forEach(t => {
    console.log(`ID: ${t.id} | Tipo: ${t.tipo} | Estado: ${t.estado} | Area: ${t.area} | Dept: ${t.departamento}`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
