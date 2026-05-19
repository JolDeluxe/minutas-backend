// minutas-backend/src/test/seed-data.ts

import {
  PrismaClient,
  Area,
  Linea,
  Clasificacion,
  Prioridad,
  EstadoTarea,
  EstadoAsignacion,
  EstadoMinuta,
  EstadoConceptual,
  EstadoOperativo,
  Rol,
} from "@prisma/client";

const prisma = new PrismaClient();

const randomInt = (
  min: number,
  max: number
) =>
  Math.floor(
    Math.random() * (max - min + 1)
  ) + min;

const randomElement = <T>(
  arr: T[]
): T =>
  arr[
    randomInt(0, arr.length - 1)
  ]!;

const generarFechaAleatoria = (
  inicio: Date,
  fin: Date
) => {
  return new Date(
    inicio.getTime() +
      Math.random() *
        (fin.getTime() -
          inicio.getTime())
  );
};

const FECHA_INICIO =
  new Date("2026-02-01T08:00:00Z");

const FECHA_FIN = new Date();

const lineas =
  Object.values(Linea);

const clasificaciones =
  Object.values(
    Clasificacion
  );

const prioridades =
  Object.values(Prioridad);

const verbos = [
  "Analizar",
  "Corregir",
  "Investigar",
  "Diseñar",
  "Validar",
  "Preparar",
  "Ajustar",
  "Modificar",
];

const objetos = [
  "suela de bota",
  "render de tienda",
  "muestra de piel",
  "patrón de chamarra",
  "política de calidad",
  "empaque de lujo",
  "herraje metálico",
  "costura lateral",
];

const complementos = [
  "para próxima junta",
  "antes de producción",
  "urgente para dirección",
  "según comentarios del dueño",
  "para validación comercial",
  "para pruebas de calidad",
];

const generarDescripcion =
  () =>
    `${randomElement(
      verbos
    )} ${randomElement(
      objetos
    )} ${randomElement(
      complementos
    )}`;

const generarTituloMinuta =
  () =>
    `Junta Ejecutiva ${randomInt(
      100,
      999
    )}`;

async function main() {
  console.log(
    "🌱 Generando data organizacional..."
  );

  const usuarios =
    await prisma.usuario.findMany({
      where: {
        departamento: "DISENO",
      },
    });

  if (
    usuarios.length === 0
  ) {
    throw new Error(
      "Primero ejecuta user-test.ts"
    );
  }

  const gerencia =
    usuarios.find(
      (u) =>
        u.rol ===
        Rol.GERENCIA
    );

  if (!gerencia) {
    throw new Error(
      "No existe usuario GERENCIA"
    );
  }

  const responsables =
    usuarios.filter(
      (u) =>
        u.rol ===
          Rol.COORDINADOR ||
        u.rol === Rol.JEFE
    );

  let totalTareas = 0;

  for (
    let i = 0;
    i < 35;
    i++
  ) {
    const fechaMinuta =
      generarFechaAleatoria(
        FECHA_INICIO,
        FECHA_FIN
      );

    const minuta =
      await prisma.minuta.create({
        data: {
          titulo:
            generarTituloMinuta(),

          lineaDefault:
            randomElement(
              lineas
            ),

          estado:
            Math.random() >
            0.5
              ? EstadoMinuta.ACTIVA
              : EstadoMinuta.CERRADA,

          fechaProgramada:
            fechaMinuta,

          fechaRealizada:
            fechaMinuta,

          createdAt:
            fechaMinuta,

          creadoPorId:
            gerencia.id,
        },
      });

    const totalEntradas =
      randomInt(5, 20);

    for (
      let j = 0;
      j < totalEntradas;
      j++
    ) {
      const fechaVencimiento =
        new Date(
          fechaMinuta
        );

      fechaVencimiento.setDate(
        fechaVencimiento.getDate() +
          randomInt(2, 20)
      );

      let estado:
        | EstadoTarea =
        EstadoTarea.PENDIENTE;

      const randomEstado =
        Math.random();

      if (
        randomEstado > 0.75
      ) {
        estado =
          EstadoTarea.CERRADO;
      } else if (
        randomEstado > 0.5
      ) {
        estado =
          EstadoTarea.COMPLETADO;
      } else if (
        randomEstado > 0.25
      ) {
        estado =
          EstadoTarea.EN_PROGRESO;
      }

      let completadoAt:
        | Date
        | null = null;

      let cerradoAt:
        | Date
        | null = null;

      if (
        estado ===
          EstadoTarea.COMPLETADO ||
        estado ===
          EstadoTarea.CERRADO
      ) {
        completadoAt =
          generarFechaAleatoria(
            fechaMinuta,
            fechaVencimiento
          );
      }

      if (
        estado ===
        EstadoTarea.CERRADO
      ) {
        cerradoAt =
          generarFechaAleatoria(
            fechaVencimiento,
            new Date()
          );
      }

      const esExterna =
        Math.random() > 0.8;

      const tarea =
        await prisma.tarea.create({
          data: {
            descripcion:
              generarDescripcion(),

            area: esExterna
              ? Area.DIRECCION_CFI
              : Area.DISENO,

            linea:
              randomElement(
                lineas
              ),

            prioridad:
              randomElement(
                prioridades
              ),

            clasificacion:
              randomElement(
                clasificaciones
              ),

            fechaVencimiento,

            capturaCompleta:
              true,

            isExternalArea:
              esExterna,

            minutaId:
              minuta.id,

            creadoPorId:
              gerencia.id,

            estado,

            completadoAt,

            cerradoAt,

            createdAt:
              fechaMinuta,

            estadoConceptual:
              estado ===
                EstadoTarea.CERRADO
                ? EstadoConceptual.CERRADO
                : EstadoConceptual.EN_REVISION,

            estadoOperativo:
              estado ===
              EstadoTarea.PENDIENTE
                ? EstadoOperativo.PENDIENTE
                : estado ===
                  EstadoTarea.EN_PROGRESO
                ? EstadoOperativo.EN_PROGRESO
                : EstadoOperativo.COMPLETADO,
          },
        });

      if (!esExterna) {
        const asignados =
          [...responsables]
            .sort(
              () =>
                0.5 -
                Math.random()
            )
            .slice(
              0,
              randomInt(1, 3)
            );

        for (const user of asignados) {
          let estadoAsig:
            EstadoAsignacion =
            EstadoAsignacion.PENDIENTE;

          if (
            estado ===
            EstadoTarea.EN_PROGRESO
          ) {
            estadoAsig =
              EstadoAsignacion.EN_PROGRESO;
          }

          if (
            estado ===
              EstadoTarea.COMPLETADO ||
            estado ===
              EstadoTarea.CERRADO
          ) {
            estadoAsig =
              EstadoAsignacion.COMPLETADO;
          }

          await prisma.tareaAsignacion.create(
            {
              data: {
                tareaId:
                  tarea.id,

                usuarioId:
                  user.id,

                estado:
                  estadoAsig,

                completadoAt:
                  completadoAt,
              },
            }
          );
        }
      }

      if (
        Math.random() >
        0.6
      ) {
        await prisma.tareaNota.create(
          {
            data: {
              tareaId:
                tarea.id,

              creadoPorId:
                gerencia.id,

              contenido:
                "Seguimiento agregado durante revisión ejecutiva.",
            },
          }
        );
      }

      totalTareas++;
    }

    const totalNotas =
      randomInt(1, 5);

    for (
      let n = 0;
      n < totalNotas;
      n++
    ) {
      await prisma.notaGeneral.create(
        {
          data: {
            minutaId:
              minuta.id,

            creadoPorId:
              gerencia.id,

            contenido: `Observación general ${n + 1} de la minuta.`,
          },
        }
      );
    }
  }

  console.log(
    "✅ Seed completado"
  );

  console.log(
    `📊 Total tareas creadas: ${totalTareas}`
  );
}

main()
  .catch((err) => {
    console.error(
      "❌ Error:",
      err
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
