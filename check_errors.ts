import { prisma } from './src/db';

async function run() {
  const user5 = await prisma.usuario.findUnique({ where: { id: 5 } });
  console.log("--- USUARIO 5 ---");
  console.log(JSON.stringify(user5, null, 2));

  const logs = await prisma.bitacora.findMany({
    where: {
      detalles: {
        contains: 'usuario ID: 5'
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  console.log("--- BITACORA ID 5 ---");
  console.log(JSON.stringify(logs, null, 2));
}

run()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
