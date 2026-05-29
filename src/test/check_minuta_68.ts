import { prisma } from "../db";
import { TipoEntrada } from "@prisma/client";

async function check() {
  const minutaId = 68;
  const minuta = await prisma.minuta.findUnique({
    where: { id: minutaId }
  });

  if (!minuta) {
    console.log("Minuta 68 not found");
    return;
  }

  const entradas = await prisma.tarea.findMany({
    where: { minutaId, tipo: { not: TipoEntrada.DESCARTADA } }
  });

  console.log(`Minuta ${minutaId} (${minuta.departamento}): ${minuta.estado}`);
  console.log("Entradas:");
  entradas.forEach(e => {
    console.log(`- ID: ${e.id}, Tipo: ${e.tipo}, Area: ${e.area}, Estado: ${e.estado}`);
  });
}

check().catch(console.error);
