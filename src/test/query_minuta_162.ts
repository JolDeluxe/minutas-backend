import { prisma } from "../db";

async function main() {
  console.log("=== Querying Minuta 162 ===");
  const minuta = await prisma.minuta.findUnique({
    where: { id: 162 },
    include: {
      tareas: {
        include: {
          imagenes: true,
          notas: true,
          asignaciones: true
        }
      },
      notasGenerales: true
    }
  });

  if (!minuta) {
    console.log("Minuta 162 not found!");
    return;
  }

  console.log("Minuta ID:", minuta.id);
  console.log("Titulo:", minuta.titulo);
  console.log("Estado:", minuta.estado);
  console.log("Total Tareas (Entries):", minuta.tareas.length);
  console.log("Total Notas Generales:", minuta.notasGenerales.length);

  minuta.tareas.forEach((t, i) => {
    console.log(`\n--- Tarea ${i + 1} ---`);
    console.log("ID:", t.id);
    console.log("Descripcion:", t.descripcion);
    console.log("Area:", t.area);
    console.log("Linea:", t.linea);
    console.log("Clasificacion:", t.clasificacion);
    console.log("Tipo:", t.tipo);
    console.log("Estado Tarea:", t.estado);
    console.log("Creado Por ID:", t.creadoPorId);
    console.log("Imágenes:", t.imagenes.length);
  });
}

main()
  .catch((e) => {
    console.error("Error executing query:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
