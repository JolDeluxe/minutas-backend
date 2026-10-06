import { prisma } from "../db";
import fs from "fs";
import path from "path";

async function main() {
  const sqlPath = path.join(process.cwd(), "prisma/migrations/20261006_add_idempotency_keys/migration.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");
  console.log("Ejecutando migración SQL local:", sql);
  await prisma.$executeRawUnsafe(sql);
  console.log("✅ Tabla idempotency_keys creada con éxito en la base de datos local.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
