import { prisma } from "./src/db";

async function checkTasks() {
  const minutaId = 68;
  const tasks = await prisma.tarea.findMany({
    where: { minutaId },
    select: {
      id: true,
      descripcion: true,
      area: true,
      tipo: true,
      estado: true
    }
  });

  console.log(`--- Tareas para Minuta ${minutaId} ---`);
  tasks.forEach(t => {
    console.log(`ID: ${t.id} | Area: "${t.area}" | Tipo: ${t.tipo} | Estado: ${t.estado} | Desc: ${t.descripcion.substring(0, 30)}...`);
  });
  
  const distinctAreas = await prisma.tarea.findMany({
    where: { minutaId },
    distinct: ['area'],
    select: { area: true }
  });
  
  console.log(`\n--- Probando filtro exacto del controlador ---`);
  const filteredTasks = await prisma.tarea.findMany({
    where: {
      minutaId,
      area: "DIRECCION_CFI" as any,
      estado: { not: "CANCELADA" },
      tipo: { in: ["TAREA", "SIN_ORGANIZAR"] }
    }
  });
  console.log(`Tareas encontradas con filtro: ${filteredTasks.length}`);
  
  console.log(`\n--- Probando filtro corregido (incluyendo NULL) ---`);
  const correctedTasks = await prisma.tarea.findMany({
    where: {
      minutaId,
      area: "DIRECCION_CFI" as any,
      OR: [
        { estado: { not: "CANCELADA" } },
        { estado: null }
      ],
      tipo: { in: ["TAREA", "SIN_ORGANIZAR"] }
    }
  });
  console.log(`Tareas encontradas con filtro corregido: ${correctedTasks.length}`);
}

checkTasks().catch(console.error);
