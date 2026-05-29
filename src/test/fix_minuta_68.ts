import { evaluateMinutaStatus } from "../modules/minutas/domain/evaluate-minuta-status";
import { prisma } from "../db";

async function run() {
  console.log("Re-evaluating Minuta 68...");
  await evaluateMinutaStatus(68, 10);
  
  const minuta = await prisma.minuta.findUnique({
    where: { id: 68 },
    select: { id: true, estado: true }
  });
  
  console.log(`Minuta 68 current status: ${minuta?.estado}`);
}

run().catch(console.error);