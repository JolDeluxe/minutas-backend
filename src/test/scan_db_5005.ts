import { prisma } from "../db";

async function main() {
  const cols = await prisma.$queryRawUnsafe<any[]>(
    "SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'minutas' AND DATA_TYPE IN ('varchar', 'text', 'mediumtext', 'longtext')"
  );

  console.log(`Buscando en ${cols.length} columnas de la base de datos...`);
  let found = 0;

  for (const c of cols) {
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as cnt FROM \`${c.TABLE_NAME}\` WHERE \`${c.COLUMN_NAME}\` LIKE '%5005%'`
      );
      const cnt = Number(rows[0]?.cnt ?? 0);
      if (cnt > 0) {
        console.log(`🚨 ENCONTRADO EN: ${c.TABLE_NAME}.${c.COLUMN_NAME} => ${cnt} registros`);
        const samples = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, \`${c.COLUMN_NAME}\` as val FROM \`${c.TABLE_NAME}\` WHERE \`${c.COLUMN_NAME}\` LIKE '%5005%' LIMIT 3`
        );
        console.log("   Muestras:", JSON.stringify(samples, null, 2));
        found++;
      }
    } catch (e) {
      // Ignorar tablas de sistema si hubiera error
    }
  }

  // Buscar también 'no-image' o 'localhost'
  for (const c of cols) {
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as cnt FROM \`${c.TABLE_NAME}\` WHERE \`${c.COLUMN_NAME}\` LIKE '%no-image%'`
      );
      const cnt = Number(rows[0]?.cnt ?? 0);
      if (cnt > 0) {
        console.log(`📌 ENCONTRADO 'no-image' EN: ${c.TABLE_NAME}.${c.COLUMN_NAME} => ${cnt} registros`);
      }
    } catch (e) {}
  }

  if (found === 0) {
    console.log("✅ No se encontró '5005' en la base de datos local actual.");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());