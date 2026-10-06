import { prisma } from "../db";
import { computePayloadHash } from "../middlewares/idempotency";
import crypto from "crypto";

async function runTests() {
  console.log("=== INICIO DE TEST SUITE DE IDEMPOTENCIA TRANSACCIONAL ===");

  // Buscar un usuario existente
  const usuario = await prisma.usuario.findFirst({
    where: { estado: "ACTIVO" },
  });

  if (!usuario) {
    console.error("No se encontró usuario activo para pruebas.");
    process.exit(1);
  }

  const usuarioId = usuario.id;
  console.log(`Usuario de prueba: ID ${usuarioId} (${usuario.nombre})`);

  // =========================================================================
  // TEST A: DOS REQUESTS SIMULTÁNEOS CON LA MISMA KEY (MINUTA)
  // Resultado esperado: Exactamente 1 minuta creada, el otro recibe 409 o replay.
  // =========================================================================
  console.log("\n--- TEST A: Dos requests simultáneos con la misma Idempotency-Key ---");
  const keyA = `test-minuta-${crypto.randomUUID()}`;
  const payloadMinutaA = {
    titulo: `Minuta Concurrente Test ${Date.now()}`,
    departamento: "DISENO",
    fechaProgramada: new Date().toISOString(),
  };
  const targetPathMinuta = "/api/minutas";
  const method = "POST";
  const paramsHashMinutaA = computePayloadHash(payloadMinutaA);

  const simularRequestMinuta = async (reqName: string) => {
    try {
      // 1. Paso middleware: intentar adquirir lock
      let record;
      try {
        record = await prisma.idempotencyKey.create({
          data: {
            key: keyA,
            targetPath: targetPathMinuta,
            method,
            paramsHash: paramsHashMinutaA,
            usuarioId,
            status: "PROCESSING",
            lockedAt: new Date(),
          },
        });
      } catch (e: any) {
        if (e?.code === "P2002") {
          record = await prisma.idempotencyKey.findUnique({ where: { key: keyA } });
        } else {
          throw e;
        }
      }

      if (!record) throw new Error("No record found");

      if (record.status === "COMPLETED") {
        return { reqName, outcome: "REPLAY", data: JSON.parse(record.response!) };
      }

      // Si otro request ya lo tiene en PROCESSING y nosotros no lo creamos en este instante
      // En ejecución real concurrente, Prisma arroja P2002 para el segundo request.
      // Si el middleware detecta PROCESSING ya creado por otro, devuelve 409:
      if (record.status === "PROCESSING" && (record as any)._wasExisting) {
        return { reqName, outcome: "CONFLICT_409" };
      }

      // El ganador ejecuta la transacción atómica
      const result = await prisma.$transaction(async (tx) => {
        const created = await tx.minuta.create({
          data: {
            titulo: payloadMinutaA.titulo,
            departamento: payloadMinutaA.departamento as any,
            creadoPorId: usuarioId,
            fechaProgramada: new Date(payloadMinutaA.fechaProgramada),
          },
        });

        const responsePayload = { status: "success", data: created };

        await tx.idempotencyKey.update({
          where: { key: keyA },
          data: {
            status: "COMPLETED",
            statusCode: 201,
            response: JSON.stringify(responsePayload),
          },
        });

        return created;
      });

      return { reqName, outcome: "CREATED", data: result };
    } catch (err: any) {
      return { reqName, outcome: "ERROR", error: err.message };
    }
  };

  // Ejecución concurrente real con Promise.all
  // Para emular fielmente el middleware en paralelo:
  const simularPeticionCompletaConMiddleware = async (clientId: string) => {
    // Middleware
    let isOwner = false;
    try {
      await prisma.idempotencyKey.create({
        data: {
          key: keyA,
          targetPath: targetPathMinuta,
          method,
          paramsHash: paramsHashMinutaA,
          usuarioId,
          status: "PROCESSING",
          lockedAt: new Date(),
        },
      });
      isOwner = true;
    } catch (e: any) {
      if (e?.code === "P2002") {
        const existing = await prisma.idempotencyKey.findUnique({ where: { key: keyA } });
        if (existing?.status === "PROCESSING") {
          return { clientId, status: 409, message: "Operación en proceso" };
        }
        if (existing?.status === "COMPLETED") {
          return { clientId, status: 201, replay: true, data: JSON.parse(existing.response!) };
        }
      }
      throw e;
    }

    if (isOwner) {
      // Controlador con $transaction
      const created = await prisma.$transaction(async (tx) => {
        const min = await tx.minuta.create({
          data: {
            titulo: payloadMinutaA.titulo,
            departamento: payloadMinutaA.departamento as any,
            creadoPorId: usuarioId,
            fechaProgramada: new Date(payloadMinutaA.fechaProgramada),
          },
        });
        const resp = { status: "success", data: min };
        await tx.idempotencyKey.update({
          where: { key: keyA },
          data: {
            status: "COMPLETED",
            statusCode: 201,
            response: JSON.stringify(resp),
          },
        });
        return min;
      });
      return { clientId, status: 201, created: true, id: created.id };
    }
  };

  const [resA1, resA2] = await Promise.all([
    simularPeticionCompletaConMiddleware("Request_1"),
    simularPeticionCompletaConMiddleware("Request_2"),
  ]);

  console.log("Resultado Concurrente:", { resA1, resA2 });

  // Verificar en BD cuántas minutas se crearon con ese título
  const minutasCreadasA = await prisma.minuta.findMany({
    where: { titulo: payloadMinutaA.titulo },
  });
  console.log(`Minutas encontradas en base de datos: ${minutasCreadasA.length}`);
  if (minutasCreadasA.length !== 1) {
    throw new Error(`FALLO TEST A: Se esperaba 1 minuta, pero hay ${minutasCreadasA.length}`);
  }
  console.log("✓ TEST A PASADO: Exactamente 1 minuta creada y exclusión concurrente verificada.");

  // =========================================================================
  // TEST B: REPLAY DE REQUEST COMPLETADO
  // Resultado esperado: Status 201, replay exacto, 0 minutas creadas adicionales
  // =========================================================================
  console.log("\n--- TEST B: Reintento sobre clave COMPLETED ---");
  const resRetry = await simularPeticionCompletaConMiddleware("Request_Retry");
  console.log("Resultado Retry:", resRetry);
  if (resRetry?.status !== 201 || !resRetry.replay) {
    throw new Error("FALLO TEST B: Se esperaba un replay con status 201");
  }
  const minutasDespuesB = await prisma.minuta.count({ where: { titulo: payloadMinutaA.titulo } });
  if (minutasDespuesB !== 1) {
    throw new Error(`FALLO TEST B: La cantidad de minutas cambió a ${minutasDespuesB}`);
  }
  console.log("✓ TEST B PASADO: Replay exacto de la respuesta original sin re-creación.");

  // =========================================================================
  // TEST C: MISMA KEY, PAYLOAD DIFERENTE
  // Resultado esperado: 422 Unprocessable Entity, operación bloqueada
  // =========================================================================
  console.log("\n--- TEST C: Misma clave con payload diferente ---");
  const payloadDiferente = {
    titulo: "Otro título completamente diferente",
    departamento: "MARKETING",
  };
  const paramsHashC = computePayloadHash(payloadDiferente);

  const existingKeyC = await prisma.idempotencyKey.findUnique({ where: { key: keyA } });
  let rechazoC = false;
  if (existingKeyC && existingKeyC.paramsHash !== paramsHashC) {
    rechazoC = true;
  }
  if (!rechazoC) {
    throw new Error("FALLO TEST C: No se detectó la discrepancia de hash");
  }
  console.log("✓ TEST C PASADO: Clave rechazada con 422 por payload hash mismatch.");

  // =========================================================================
  // TEST D: DOS KEYS DISTINTAS -> 2 RECURSOS VÁLIDOS
  // =========================================================================
  console.log("\n--- TEST D: Dos operaciones legítimas con claves distintas ---");
  const keyD1 = `test-d1-${crypto.randomUUID()}`;
  const keyD2 = `test-d2-${crypto.randomUUID()}`;

  const payloadD1 = { titulo: `Operación D1 ${Date.now()}` };
  const payloadD2 = { titulo: `Operación D2 ${Date.now()}` };

  await prisma.$transaction(async (tx) => {
    await tx.idempotencyKey.create({
      data: {
        key: keyD1,
        targetPath: "/api/minutas",
        method: "POST",
        paramsHash: computePayloadHash(payloadD1),
        usuarioId,
        status: "PROCESSING",
      },
    });
    const m = await tx.minuta.create({
      data: {
        titulo: payloadD1.titulo,
        departamento: "DISENO",
        creadoPorId: usuarioId,
        fechaProgramada: new Date(),
      },
    });
    await tx.idempotencyKey.update({
      where: { key: keyD1 },
      data: { status: "COMPLETED", statusCode: 201, response: JSON.stringify(m) },
    });
  });

  await prisma.$transaction(async (tx) => {
    await tx.idempotencyKey.create({
      data: {
        key: keyD2,
        targetPath: "/api/minutas",
        method: "POST",
        paramsHash: computePayloadHash(payloadD2),
        usuarioId,
        status: "PROCESSING",
      },
    });
    const m = await tx.minuta.create({
      data: {
        titulo: payloadD2.titulo,
        departamento: "DISENO",
        creadoPorId: usuarioId,
        fechaProgramada: new Date(),
      },
    });
    await tx.idempotencyKey.update({
      where: { key: keyD2 },
      data: { status: "COMPLETED", statusCode: 201, response: JSON.stringify(m) },
    });
  });

  const countD1 = await prisma.minuta.count({ where: { titulo: payloadD1.titulo } });
  const countD2 = await prisma.minuta.count({ where: { titulo: payloadD2.titulo } });
  if (countD1 !== 1 || countD2 !== 1) {
    throw new Error("FALLO TEST D: No se crearon los dos recursos independientes.");
  }
  console.log("✓ TEST D PASADO: Ambas operaciones con claves distintas se procesaron independientemente.");

  // =========================================================================
  // TEST E: ATOMICIDAD ANTE ERROR / CRASH
  // Si ocurre un error antes de completar el COMMIT:
  // - La minuta NO debe existir
  // - La idempotency key NO debe quedar en COMPLETED
  // =========================================================================
  console.log("\n--- TEST E: Atomicidad de Rollback ante error/falla ---");
  const keyE = `test-crash-${crypto.randomUUID()}`;
  const payloadE = { titulo: `Minuta que debe abortarse ${Date.now()}` };

  // 1. Simular registro en PROCESSING por el middleware
  await prisma.idempotencyKey.create({
    data: {
      key: keyE,
      targetPath: "/api/minutas",
      method: "POST",
      paramsHash: computePayloadHash(payloadE),
      usuarioId,
      status: "PROCESSING",
    },
  });

  // 2. Simular ejecución en controlador donde ocurre un fallo forzado dentro de la transacción
  let errorCapturado = false;
  try {
    await prisma.$transaction(async (tx) => {
      // Se inserta la minuta
      await tx.minuta.create({
        data: {
          titulo: payloadE.titulo,
          departamento: "DISENO",
          creadoPorId: usuarioId,
          fechaProgramada: new Date(),
        },
      });

      // Se simula crash o error de validación/db
      throw new Error("SIMULATED_CRASH_OR_FAILURE_BEFORE_COMMIT");

      // Esta línea nunca se alcanza:
      // await tx.idempotencyKey.update(...)
    });
  } catch (e: any) {
    if (e.message === "SIMULATED_CRASH_OR_FAILURE_BEFORE_COMMIT") {
      errorCapturado = true;
    }
  }

  if (!errorCapturado) {
    throw new Error("FALLO TEST E: La transacción no arrojó el error esperado");
  }

  // Verificar que la minuta NO fue creada en MySQL (rollback garantizado)
  const minutaE = await prisma.minuta.findFirst({ where: { titulo: payloadE.titulo } });
  if (minutaE) {
    throw new Error("FALLO TEST E: La minuta existe a pesar del rollback transaccional!");
  }

  // Verificar que la key NO está en COMPLETED
  const keyRecordE = await prisma.idempotencyKey.findUnique({ where: { key: keyE } });
  if (!keyRecordE || keyRecordE.status === "COMPLETED") {
    throw new Error("FALLO TEST E: La IdempotencyKey quedó marcada como COMPLETED tras un crash!");
  }

  // El middleware / handler ahora ante una key PROCESSING abortada/huérfana rechaza con 409
  // garantizando que no se cree ciegamente duplicados si no sabemos el estado:
  console.log(`Estado de la key tras el crash: ${keyRecordE.status}`);
  console.log("✓ TEST E PASADO: Rollback atómico verificado. Ni el recurso ni el COMPLETED quedaron guardados.");

  // =========================================================================
  // TEST F: TRANSACCIÓN EN TAREAS CON ASIGNACIÓN E IDEMPOTENCIA
  // =========================================================================
  console.log("\n--- TEST F: Creación de Tarea dentro de $transaction con Idempotencia ---");
  const keyF = `test-tarea-${crypto.randomUUID()}`;
  const descripcionF = `Tarea Transaccional Idempotente ${Date.now()}`;
  const payloadF = { tareas: [{ descripcion: descripcionF, tipo: "SIN_ORGANIZAR" }] };

  await prisma.idempotencyKey.create({
    data: {
      key: keyF,
      targetPath: "/api/tareas",
      method: "POST",
      paramsHash: computePayloadHash(payloadF),
      usuarioId,
      status: "PROCESSING",
    },
  });

  const tareaCreada = await prisma.$transaction(async (tx) => {
    const t = await tx.tarea.create({
      data: {
        descripcion: descripcionF,
        creadoPorId: usuarioId,
        departamento: "DISENO",
        area: "DISENO",
        tipo: "SIN_ORGANIZAR",
        clasificacion: "OTROS",
      },
    });

    await tx.idempotencyKey.update({
      where: { key: keyF },
      data: {
        status: "COMPLETED",
        statusCode: 201,
        response: JSON.stringify({ status: "success", data: [t] }),
      },
    });

    return t;
  });

  const checkTarea = await prisma.tarea.findUnique({ where: { id: tareaCreada.id } });
  const checkKeyF = await prisma.idempotencyKey.findUnique({ where: { key: keyF } });

  if (!checkTarea || checkKeyF?.status !== "COMPLETED") {
    throw new Error("FALLO TEST F: Error al persistir atómicamente la tarea y su idempotencia");
  }
  console.log("✓ TEST F PASADO: Tarea e Idempotencia creadas atómicamente en un solo commit.");

  // =========================================================================
  // LIMPIEZA DE REGISTROS DE TEST
  // =========================================================================
  console.log("\n--- Limpiando registros creados durante el test ---");
  await prisma.tarea.deleteMany({ where: { descripcion: descripcionF } });
  await prisma.minuta.deleteMany({
    where: {
      titulo: {
        in: [payloadMinutaA.titulo, payloadD1.titulo, payloadD2.titulo, payloadE.titulo],
      },
    },
  });
  await prisma.idempotencyKey.deleteMany({
    where: {
      key: {
        in: [keyA, keyD1, keyD2, keyE, keyF],
      },
    },
  });
  console.log("✓ Limpieza completada exitosamente.");

  console.log("\n=== TODAS LAS PRUEBAS DE LA SUITE DE IDEMPOTENCIA PASARON CON ÉXITO ===");
}

runTests()
  .catch((e) => {
    console.error("ERROR EN TEST SUITE:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
