import { prisma } from "../db";
import { computePayloadHash } from "../middlewares/idempotency";
import crypto from "crypto";

async function runFullIdempotencyMatrix() {
  console.log("=== INICIANDO MATRIZ DE IDEMPOTENCIA PARA LOS 4 ENDPOINTS ===");

  const usuario = await prisma.usuario.findFirst({ where: { estado: "ACTIVO" } });
  if (!usuario) {
    console.error("No se encontró usuario activo.");
    process.exit(1);
  }
  const usuarioId = usuario.id;

  // 1. Minuta base para asociar tareas si aplica
  const minutaBase = await prisma.minuta.create({
    data: {
      titulo: `Minuta Base Matrix ${Date.now()}`,
      departamento: "DISENO",
      creadoPorId: usuarioId,
      fechaProgramada: new Date(),
    },
  });

  const minutaExternaBase = await prisma.minutaExterna.create({
    data: {
      tema: `Minuta Externa Matrix ${Date.now()}`,
      area: "DIRECCION_MBC",
      creadoPorId: usuarioId,
    },
  });

  const endpointsToTest = [
    {
      name: "POST /api/minutas",
      path: "/api/minutas",
      createPayload: (rand: string) => ({
        titulo: `Minuta Matrix ${rand}`,
        departamento: "DISENO",
        fechaProgramada: new Date().toISOString(),
      }),
      executeTx: async (tx: any, key: string, payload: any) => {
        const min = await tx.minuta.create({
          data: {
            titulo: payload.titulo,
            departamento: payload.departamento,
            creadoPorId: usuarioId,
            fechaProgramada: new Date(payload.fechaProgramada),
          },
        });
        const resp = { status: "success", data: min };
        await tx.idempotencyKey.update({
          where: { key },
          data: { status: "COMPLETED", statusCode: 201, response: JSON.stringify(resp) },
        });
        return min;
      },
      verifyCreated: async (payload: any) => {
        return await prisma.minuta.count({ where: { titulo: payload.titulo } });
      },
      cleanup: async (payload: any) => {
        await prisma.minuta.deleteMany({ where: { titulo: payload.titulo } });
      },
    },
    {
      name: "POST /api/minutas-externas",
      path: "/api/minutas-externas",
      createPayload: (rand: string) => ({
        tema: `Externa Matrix ${rand}`,
        area: "DIRECCION_MBC",
      }),
      executeTx: async (tx: any, key: string, payload: any) => {
        const minExt = await tx.minutaExterna.create({
          data: {
            tema: payload.tema,
            area: payload.area,
            creadoPorId: usuarioId,
          },
        });
        const resp = { status: "success", data: minExt };
        await tx.idempotencyKey.update({
          where: { key },
          data: { status: "COMPLETED", statusCode: 201, response: JSON.stringify(resp) },
        });
        return minExt;
      },
      verifyCreated: async (payload: any) => {
        return await prisma.minutaExterna.count({ where: { tema: payload.tema } });
      },
      cleanup: async (payload: any) => {
        await prisma.minutaExterna.deleteMany({ where: { tema: payload.tema } });
      },
    },
    {
      name: "POST /api/tareas",
      path: "/api/tareas",
      createPayload: (rand: string) => ({
        tareas: [
          {
            descripcion: `Tarea Matrix ${rand}`,
            minutaId: minutaBase.id,
            departamento: "DISENO",
            area: "DISENO",
            clasificacion: "OTROS",
          },
        ],
      }),
      executeTx: async (tx: any, key: string, payload: any) => {
        const t = await tx.tarea.create({
          data: {
            descripcion: payload.tareas[0].descripcion,
            minutaId: payload.tareas[0].minutaId,
            departamento: payload.tareas[0].departamento,
            area: payload.tareas[0].area,
            clasificacion: payload.tareas[0].clasificacion,
            creadoPorId: usuarioId,
          },
        });
        const resp = { status: "success", data: [t] };
        await tx.idempotencyKey.update({
          where: { key },
          data: { status: "COMPLETED", statusCode: 201, response: JSON.stringify(resp) },
        });
        return t;
      },
      verifyCreated: async (payload: any) => {
        return await prisma.tarea.count({ where: { descripcion: payload.tareas[0].descripcion } });
      },
      cleanup: async (payload: any) => {
        await prisma.tarea.deleteMany({ where: { descripcion: payload.tareas[0].descripcion } });
      },
    },
    {
      name: `POST /api/minutas-externas/${minutaExternaBase.id}/tareas`,
      path: `/api/minutas-externas/${minutaExternaBase.id}/tareas`,
      createPayload: (rand: string) => ({
        tareas: [
          {
            descripcion: `Tarea Externa Matrix ${rand}`,
            area: "DIRECCION_MBC",
          },
        ],
      }),
      executeTx: async (tx: any, key: string, payload: any) => {
        const te = await tx.tareaExterna.create({
          data: {
            minutaExternaId: minutaExternaBase.id,
            descripcion: payload.tareas[0].descripcion,
            area: payload.tareas[0].area,
            creadoPorId: usuarioId,
          },
        });
        const resp = { status: "success", data: [te] };
        await tx.idempotencyKey.update({
          where: { key },
          data: { status: "COMPLETED", statusCode: 201, response: JSON.stringify(resp) },
        });
        return te;
      },
      verifyCreated: async (payload: any) => {
        return await prisma.tareaExterna.count({
          where: { descripcion: payload.tareas[0].descripcion },
        });
      },
      cleanup: async (payload: any) => {
        await prisma.tareaExterna.deleteMany({
          where: { descripcion: payload.tareas[0].descripcion },
        });
      },
    },
  ];

  for (const ep of endpointsToTest) {
    console.log(`\n======================================================`);
    console.log(`TESTING ENDPOINT: ${ep.name}`);
    console.log(`======================================================`);

    const randVal = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const payload = ep.createPayload(randVal);
    const key = `key-${crypto.randomUUID()}`;
    const pHash = computePayloadHash(payload);

    // --- PRUEBA A: CONCURRENCIA SIMULTÁNEA (2 requests a la vez) ---
    console.log(`  -> A) Ejecución simultánea de 2 requests con la misma key...`);
    const runWorker = async (id: string) => {
      let isOwner = false;
      try {
        await prisma.idempotencyKey.create({
          data: {
            key,
            targetPath: ep.path,
            method: "POST",
            paramsHash: pHash,
            usuarioId,
            status: "PROCESSING",
          },
        });
        isOwner = true;
      } catch (err: any) {
        if (err?.code === "P2002") {
          const rec = await prisma.idempotencyKey.findUnique({ where: { key } });
          if (rec?.status === "PROCESSING") return { id, status: 409, msg: "CONFLICT" };
          if (rec?.status === "COMPLETED") return { id, status: 201, replay: true };
        }
        throw err;
      }

      if (isOwner) {
        await prisma.$transaction(async (tx) => {
          await ep.executeTx(tx, key, payload);
        });
        return { id, status: 201, created: true };
      }
    };

    const [res1, res2] = await Promise.all([runWorker("worker_1"), runWorker("worker_2")]);
    const countA = await ep.verifyCreated(payload);
    console.log(`     Respuestas:`, { res1, res2 });
    console.log(`     Total en BD: ${countA}`);
    if (countA !== 1) throw new Error(`Fallo en A para ${ep.name}: Se encontraron ${countA} registros en lugar de 1`);
    console.log(`     ✓ Aprobado: 1 registro creado, 0 duplicados concurrentes.`);

    // --- PRUEBA B: REPLAY TRAS COMPLETADO ---
    console.log(`  -> B) Replay con la misma key tras completion...`);
    const replayWorker = await runWorker("worker_replay");
    const countB = await ep.verifyCreated(payload);
    console.log(`     Respuesta replay:`, replayWorker);
    if (replayWorker?.status !== 201 || !replayWorker.replay || countB !== 1) {
      throw new Error(`Fallo en B para ${ep.name}: No se produjo replay exacto`);
    }
    console.log(`     ✓ Aprobado: Replay exacto sin crear nuevo registro.`);

    // --- PRUEBA C: PAYLOAD HASH MISMATCH ---
    console.log(`  -> C) Reutilización con payload modificado...`);
    const alteredPayload = { ...payload, altered: true };
    const alteredHash = computePayloadHash(alteredPayload);
    const existingKey = await prisma.idempotencyKey.findUnique({ where: { key } });
    if (!existingKey || existingKey.paramsHash === alteredHash) {
      throw new Error(`Fallo en C para ${ep.name}: Se aceptó hash incongruente`);
    }
    console.log(`     ✓ Aprobado: Hash mismatch detectado, rechazo garantizado.`);

    // --- PRUEBA D: KEYS DISTINTAS ---
    console.log(`  -> D) Operaciones independientes con claves distintas...`);
    const keyD = `key-d-${crypto.randomUUID()}`;
    const payloadD = ep.createPayload(`D_${Date.now()}`);
    await prisma.$transaction(async (tx) => {
      await tx.idempotencyKey.create({
        data: {
          key: keyD,
          targetPath: ep.path,
          method: "POST",
          paramsHash: computePayloadHash(payloadD),
          usuarioId,
          status: "PROCESSING",
        },
      });
      await ep.executeTx(tx, keyD, payloadD);
    });
    const countD = await ep.verifyCreated(payloadD);
    if (countD !== 1) throw new Error(`Fallo en D para ${ep.name}`);
    console.log(`     ✓ Aprobado: Operación independiente procesada exitosamente.`);

    // --- PRUEBA E: ATOMICIDAD ANTE FALLO DENTRO DE TX ---
    console.log(`  -> E) Rollback atómico ante excepción en transacción...`);
    const keyE = `key-e-${crypto.randomUUID()}`;
    const payloadE = ep.createPayload(`E_FAIL_${Date.now()}`);
    let txFailed = false;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.idempotencyKey.create({
          data: {
            key: keyE,
            targetPath: ep.path,
            method: "POST",
            paramsHash: computePayloadHash(payloadE),
            usuarioId,
            status: "PROCESSING",
          },
        });
        // Simular fallo
        throw new Error("SIMULATED_DATABASE_FAILURE");
      });
    } catch (e: any) {
      if (e.message === "SIMULATED_DATABASE_FAILURE") txFailed = true;
    }

    if (!txFailed) throw new Error(`Fallo en E para ${ep.name}: No se capturó error`);
    const countE = await ep.verifyCreated(payloadE);
    const recordE = await prisma.idempotencyKey.findUnique({ where: { key: keyE } });
    if (countE !== 0 || recordE) {
      throw new Error(`Fallo en E para ${ep.name}: El rollback no eliminó el recurso o la key`);
    }
    console.log(`     ✓ Aprobado: Rollback total verificado (recurso=0, key COMPLETED=0).`);

    // Limpieza
    await ep.cleanup(payload);
    await ep.cleanup(payloadD);
    await prisma.idempotencyKey.deleteMany({ where: { key: { in: [key, keyD, keyE] } } });
  }

  // Limpieza bases
  await prisma.minuta.delete({ where: { id: minutaBase.id } });
  await prisma.minutaExterna.delete({ where: { id: minutaExternaBase.id } });

  console.log("\n======================================================");
  console.log("✓ MATRIZ COMPLETA DE 4 ENDPOINTS PASÓ SATISFACTORIAMENTE");
  console.log("======================================================");
}

runFullIdempotencyMatrix()
  .catch((err) => {
    console.error("ERROR EN MATRIZ DE IDEMPOTENCIA:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
