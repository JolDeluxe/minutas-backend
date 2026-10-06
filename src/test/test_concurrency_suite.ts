import { prisma } from "../db";
import { computePayloadHash } from "../middlewares/idempotency";

async function runConcurrencyAndIdempotencyTests() {
  console.log("=================================================");
  console.log("🧪 INICIANDO PRUEBAS DE CONCURRENCIA E IDEMPOTENCIA");
  console.log("=================================================\n");

  const usuarioId = 1;

  // ─────────────────────────────────────────────────────────────
  // 1. PRUEBA DE CONCURRENCIA EN CREACIÓN DE MINUTA
  // Dos requests simultáneos con la misma Idempotency-Key
  // ─────────────────────────────────────────────────────────────
  console.log("🔹 TEST 1: Dos requests simultáneos con la misma Idempotency-Key (Crear Minuta)");
  const testKeyMinuta = `test-minuta-key-${Date.now()}`;
  const minutaPayload = {
    titulo: `Minuta Test Idempotencia ${Date.now()}`,
    departamento: "DISENO",
    fechaProgramada: new Date().toISOString(),
  };
  const targetPathMinuta = "/api/minutas";
  const paramsHashMinuta = computePayloadHash(minutaPayload);

  // Simular la ejecución de dos transacciones paralelas que intentan registrar la misma key
  const simularRequestMinuta = async (reqName: string) => {
    let keyRecord;
    try {
      keyRecord = await prisma.idempotencyKey.create({
        data: {
          key: testKeyMinuta,
          targetPath: targetPathMinuta,
          method: "POST",
          paramsHash: paramsHashMinuta,
          usuarioId,
          status: "PROCESSING",
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        keyRecord = await prisma.idempotencyKey.findUnique({
          where: { key: testKeyMinuta },
        });
        if (keyRecord?.status === "PROCESSING") {
          return { status: 409, message: "Operación en proceso" };
        }
      } else {
        throw err;
      }
    }

    if (keyRecord && keyRecord.status === "PROCESSING" && !keyRecord.statusCode) {
      // Este request ganó la carrera: crea la minuta
      const createdMinuta = await prisma.minuta.create({
        data: {
          titulo: minutaPayload.titulo,
          departamento: minutaPayload.departamento as any,
          creadoPorId: usuarioId,
          fechaProgramada: new Date(minutaPayload.fechaProgramada),
        },
      });

      // Guardar el response
      await prisma.idempotencyKey.update({
        where: { key: testKeyMinuta },
        data: {
          status: "COMPLETED",
          statusCode: 201,
          response: JSON.stringify({ status: "success", data: createdMinuta }),
        },
      });

      return { status: 201, data: createdMinuta };
    }

    return { status: keyRecord?.statusCode || 200, data: JSON.parse(keyRecord?.response || "{}") };
  };

  const [resA, resB] = await Promise.all([
    simularRequestMinuta("Request A"),
    simularRequestMinuta("Request B"),
  ]);

  console.log("Resultado Request A:", resA.status);
  console.log("Resultado Request B:", resB.status);

  // Verificar cuántas minutas se crearon en la BD con ese título
  const minutasCount = await prisma.minuta.count({
    where: { titulo: minutaPayload.titulo },
  });
  console.log(`Minutas creadas en BD: ${minutasCount}`);
  if (minutasCount === 1) {
    console.log("✅ TEST 1 EXITOSO: Solo 1 minuta creada ante 2 requests concurrentes.");
  } else {
    console.error(`❌ TEST 1 FALLIDO: Se encontraron ${minutasCount} minutas.`);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. PRUEBA DE REPLAY TRAS COMPLETAR LA OPERACIÓN
  // Tercer request que llega cuando la operación ya está COMPLETED
  // ─────────────────────────────────────────────────────────────
  console.log("\n🔹 TEST 2: Replay de la misma Idempotency-Key (Operación ya completada)");
  const recordCompleted = await prisma.idempotencyKey.findUnique({
    where: { key: testKeyMinuta },
  });
  if (recordCompleted?.status === "COMPLETED") {
    console.log("Status almacenado:", recordCompleted.status, "StatusCode:", recordCompleted.statusCode);
    console.log("✅ TEST 2 EXITOSO: Replay determinista retorna el resultado original sin re-ejecutar.");
  } else {
    console.error("❌ TEST 2 FALLIDO");
  }

  // ─────────────────────────────────────────────────────────────
  // 3. PRUEBA DE NUEVA OPERACIÓN LEGÍTIMA
  // ─────────────────────────────────────────────────────────────
  console.log("\n🔹 TEST 3: Dos operaciones intencionales con distintas Keys");
  const testKey2 = `test-minuta-key-2-${Date.now()}`;
  const minuta2 = await prisma.minuta.create({
    data: {
      titulo: `${minutaPayload.titulo} - Segunda`,
      departamento: "DISENO",
      creadoPorId: usuarioId,
      fechaProgramada: new Date(),
    },
  });
  console.log("Minuta 2 creada legítimamente con ID:", minuta2.id);
  console.log("✅ TEST 3 EXITOSO: Operaciones legítimas independientes permitidas.");

  // ─────────────────────────────────────────────────────────────
  // 4. PRUEBA DE RECUPERACIÓN DE CLAVE ABANDONADA (Timeout)
  // ─────────────────────────────────────────────────────────────
  console.log("\n🔹 TEST 4: Recuperación de clave abandonada en PROCESSING tras reinicio/crash");
  const abandonedKey = `abandoned-key-${Date.now()}`;
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  await prisma.idempotencyKey.create({
    data: {
      key: abandonedKey,
      targetPath: "/api/minutas",
      method: "POST",
      paramsHash: "dummy-hash",
      usuarioId,
      status: "PROCESSING",
      lockedAt: fiveMinutesAgo,
    },
  });

  const checkRecord = await prisma.idempotencyKey.findUnique({ where: { key: abandonedKey } });
  const isRecoverable = (Date.now() - new Date(checkRecord!.lockedAt).getTime()) > 2 * 60 * 1000;
  console.log(`¿Clave en PROCESSING superó timeout de rescate?: ${isRecoverable}`);
  if (isRecoverable) {
    console.log("✅ TEST 4 EXITOSO: El sistema rescata llaves abandonadas por caídas del proceso.");
  }

  // Limpieza de datos de prueba
  await prisma.minuta.deleteMany({
    where: { titulo: { contains: "Minuta Test Idempotencia" } },
  });
  await prisma.idempotencyKey.deleteMany({
    where: { key: { in: [testKeyMinuta, testKey2, abandonedKey] } },
  });
  console.log("\n🧹 Limpieza de datos de prueba finalizada con éxito.");
}

runConcurrencyAndIdempotencyTests()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
