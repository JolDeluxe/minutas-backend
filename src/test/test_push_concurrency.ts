import { prisma } from "../db";

async function testPushSubscriptionConcurrency() {
  const testEndpoint = `https://fcm.googleapis.com/fcm/send/test-token-${Date.now()}`;
  const keys = {
    p256dh: "BMm-test-p256dh-key-sample",
    auth: "test-auth-sample-123",
  };
  const usuarioId = 1;

  console.log("Iniciando prueba de concurrencia PushSubscription...");
  console.log("Endpoint de prueba:", testEndpoint);

  // Simular dos requests HTTP exactamente concurrentes hacia el mismo endpoint
  const reqA = prisma.pushSubscription.upsert({
    where: { endpoint: testEndpoint },
    update: {
      p256dh: keys.p256dh,
      auth: keys.auth,
      usuarioId,
      lastSuccess: new Date(),
      failureCount: 0,
    },
    create: {
      endpoint: testEndpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      usuarioId,
    },
  }).catch(async (err: any) => {
    if (err?.code === "P2002") {
      return prisma.pushSubscription.update({
        where: { endpoint: testEndpoint },
        data: {
          p256dh: keys.p256dh,
          auth: keys.auth,
          usuarioId,
          lastSuccess: new Date(),
        },
      });
    }
    throw err;
  });

  const reqB = prisma.pushSubscription.upsert({
    where: { endpoint: testEndpoint },
    update: {
      p256dh: keys.p256dh,
      auth: keys.auth,
      usuarioId,
      lastSuccess: new Date(),
      failureCount: 0,
    },
    create: {
      endpoint: testEndpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      usuarioId,
    },
  }).catch(async (err: any) => {
    if (err?.code === "P2002") {
      return prisma.pushSubscription.update({
        where: { endpoint: testEndpoint },
        data: {
          p256dh: keys.p256dh,
          auth: keys.auth,
          usuarioId,
          lastSuccess: new Date(),
        },
      });
    }
    throw err;
  });

  const results = await Promise.all([reqA, reqB]);

  console.log("Resultados obtenidos sin errores:", results.map(r => ({ id: r.id, endpoint: r.endpoint })));

  const count = await prisma.pushSubscription.count({
    where: { endpoint: testEndpoint },
  });

  console.log(`Conteo final en base de datos para el endpoint: ${count}`);

  if (count === 1) {
    console.log("✅ ÉXITO: Exactamente 1 registro persistido, cero errores P2002 no manejados.");
  } else {
    console.error(`❌ FALLO: Se encontraron ${count} registros.`);
  }

  // Limpieza de prueba
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: testEndpoint },
  });
  console.log("Limpieza completada.");
}

testPushSubscriptionConcurrency()
  .catch((e) => {
    console.error("Error en test de concurrencia:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
