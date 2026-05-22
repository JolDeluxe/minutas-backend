import {
  PrismaClient,
  Area,
  Prioridad,
  EstadoTarea,
  EstadoMinuta,
  Rol,
  TipoEntrada,
  Departamento,
  AlcanceRecordatorio
} from "@prisma/client";

const prisma = new PrismaClient();

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomElement = <T>(arr: T[]): T => arr[randomInt(0, arr.length - 1)]!;
const generarFechaAleatoria = (inicio: Date, fin: Date) => new Date(inicio.getTime() + Math.random() * (fin.getTime() - inicio.getTime()));

// Generar datos desde Enero 2026
const FECHA_INICIO = new Date("2026-01-01T08:00:00Z");
const FECHA_FIN = new Date();

// Catálogos extraídos de configuracion/controller.ts
const CATALOGOS = {
  DISENO: {
    lineas: ["CALZADO", "BOTA", "ROPA", "ACCESORIOS", "OTROS"],
    clasificaciones: ["IDEA", "INVESTIGACION", "CORRECCION", "ANALISIS", "MUESTRA", "POLITICAS", "OTROS"]
  },
  MARKETING: {
    lineas: ["CAMPANA"], // Fallback para bd, aunque marketing no usa linea obligatoria frontend
    clasificaciones: ["REDES_SOCIALES", "DISENO_INSUMOS", "TIENDAS", "CATALOGOS", "OTROS"]
  }
};

const prioridades = Object.values(Prioridad);

// Diccionarios creativos
const descripciones = {
  DISENO: [
    "Analizar proveedor de suelas italianas",
    "Corregir patrón de chamarra de piel temporada otoño",
    "Investigar nuevos herrajes metálicos sin plomo",
    "Diseñar nueva horma para bota vaquera",
    "Validar calidad de costura en calzado confort",
    "Preparar paleta de colores primavera/verano",
    "Ajustar medidas de cinturón de vestir",
    "Muestra de piel exótica retenida en aduana"
  ],
  MARKETING: [
    "Planear pauta digital campaña Día de la Madre",
    "Diseñar renders para escaparates CDMX",
    "Investigar influencers para nueva colección",
    "Aprobar catálogo impreso otoño-invierno",
    "Coordinar sesión de fotos con modelos",
    "Revisar analytics de Instagram",
    "Ajustar material POP de tiendas",
    "Campaña de fidelización clientes VIP"
  ]
};

async function main() {
  console.log("🌱 Generando data organizacional de minutas y tareas...");

  const usuariosDiseno = await prisma.usuario.findMany({ where: { departamento: Departamento.DISENO } });
  const usuariosMkt = await prisma.usuario.findMany({ where: { departamento: Departamento.MARKETING } });

  if (usuariosDiseno.length === 0 || usuariosMkt.length === 0) {
    throw new Error("Faltan usuarios. Por favor ejecuta primero `bun run seed:clean`");
  }

  const gerenteDiseno = usuariosDiseno.find(u => u.rol === Rol.GERENCIA)!;
  const gerenteMkt = usuariosMkt.find(u => u.rol === Rol.GERENCIA)!;

  const posiblesAsignadosDiseno = usuariosDiseno.filter(u => u.rol === Rol.COORDINADOR || u.rol === Rol.JEFE);
  const posiblesAsignadosMkt = usuariosMkt.filter(u => u.rol === Rol.COORDINADOR || u.rol === Rol.JEFE);

  let totalTareas = 0;
  let totalMinutas = 0;

  const departamentos = [
    { nombre: Departamento.DISENO, gerente: gerenteDiseno, responsables: posiblesAsignadosDiseno },
    { nombre: Departamento.MARKETING, gerente: gerenteMkt, responsables: posiblesAsignadosMkt }
  ];

  for (const depto of departamentos) {
    // 25 minutas por departamento
    for (let i = 0; i < 25; i++) {
      const fechaMinuta = generarFechaAleatoria(FECHA_INICIO, FECHA_FIN);
      const isCerrada = Math.random() > 0.3; // 70% cerradas
      
      const cats = CATALOGOS[depto.nombre];

      const minuta = await prisma.minuta.create({
        data: {
          titulo: `Junta de Seguimiento ${depto.nombre} ${i+1}`,
          lineaDefault: randomElement(cats.lineas),
          departamento: depto.nombre,
          estado: isCerrada ? EstadoMinuta.CERRADA : EstadoMinuta.ACTIVA,
          fechaProgramada: fechaMinuta,
          fechaRealizada: fechaMinuta,
          createdAt: fechaMinuta,
          creadoPorId: depto.gerente.id,
          cerradoPorId: isCerrada ? depto.gerente.id : null,
          cerradoAt: isCerrada ? generarFechaAleatoria(fechaMinuta, FECHA_FIN) : null,
        },
      });
      totalMinutas++;

      // Post-its de minuta
      const totalNotas = randomInt(1, 3);
      for (let n = 0; n < totalNotas; n++) {
        await prisma.notaGeneral.create({
          data: {
            minutaId: minuta.id,
            creadoPorId: depto.gerente.id,
            contenido: `Anotación general de junta ${depto.nombre}. Puntos rápidos tratados.`,
            createdAt: fechaMinuta
          },
        });
      }

      const totalEntradas = randomInt(8, 25);

      for (let j = 0; j < totalEntradas; j++) {
        // Distribuir tipos: 70% TAREAS, 10% RECORDATORIOS, 10% POLITICAS, 10% DESCARTADAS
        const randTipo = Math.random();
        let tipoEntrada: TipoEntrada = TipoEntrada.TAREA;
        if (randTipo > 0.9) tipoEntrada = TipoEntrada.DESCARTADA;
        else if (randTipo > 0.8) tipoEntrada = TipoEntrada.POLITICA;
        else if (randTipo > 0.7) tipoEntrada = TipoEntrada.RECORDATORIO;

        const fechaVencimiento = new Date(fechaMinuta);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + randomInt(2, 30));

        let estado: EstadoTarea | null = null;
        let prioridad: Prioridad | null = null;
        let completadoAt: Date | null = null;
        let cerradoAt: Date | null = null;
        let alcanceRecordatorio: AlcanceRecordatorio | null = null;

        if (tipoEntrada === TipoEntrada.TAREA) {
          prioridad = randomElement(prioridades);
          
          if (isCerrada) {
             estado = EstadoTarea.CERRADA;
          } else {
             const randomEstado = Math.random();
             if (randomEstado > 0.8) estado = EstadoTarea.CERRADA;
             else if (randomEstado > 0.4) estado = EstadoTarea.EN_REVISION;
             else estado = EstadoTarea.PENDIENTE;
          }

          if (estado === EstadoTarea.EN_REVISION || estado === EstadoTarea.CERRADA) {
            completadoAt = generarFechaAleatoria(fechaMinuta, fechaVencimiento);
          }

          if (estado === EstadoTarea.CERRADA) {
            cerradoAt = generarFechaAleatoria(completadoAt || fechaMinuta, FECHA_FIN);
          }
        } else if (tipoEntrada === TipoEntrada.RECORDATORIO) {
           alcanceRecordatorio = Math.random() > 0.5 ? AlcanceRecordatorio.DEPARTAMENTO : AlcanceRecordatorio.PERSONAL;
        }

        const clasificacionStr = tipoEntrada === TipoEntrada.POLITICA ? "POLITICAS" : randomElement(cats.clasificaciones);

        const tarea = await prisma.tarea.create({
          data: {
            descripcion: randomElement(descripciones[depto.nombre]),
            departamento: depto.nombre,
            area: depto.nombre === Departamento.DISENO ? Area.DISENO : Area.MARKETING,
            linea: randomElement(cats.lineas),
            clasificacion: clasificacionStr,
            tipo: tipoEntrada,
            estado,
            prioridad,
            alcanceRecordatorio,
            fechaVencimiento: tipoEntrada === TipoEntrada.TAREA ? fechaVencimiento : null,
            minutaId: minuta.id,
            creadoPorId: depto.gerente.id,
            organizadoPorId: depto.gerente.id,
            organizadoAt: fechaMinuta,
            completadoAt,
            cerradoAt,
            createdAt: fechaMinuta,
          },
        });

        // Asignaciones
        if (tipoEntrada === TipoEntrada.TAREA || (tipoEntrada === TipoEntrada.RECORDATORIO && alcanceRecordatorio === AlcanceRecordatorio.PERSONAL)) {
          const asignados = [...depto.responsables].sort(() => 0.5 - Math.random()).slice(0, randomInt(1, 2));
          for (const user of asignados) {
            await prisma.tareaAsignacion.create({
              data: {
                tareaId: tarea.id,
                usuarioId: user.id,
                asignadoPorId: depto.gerente.id
              },
            });
          }
        }

        // Notas a Tareas (solo en algunas operativas)
        if (tipoEntrada === TipoEntrada.TAREA && Math.random() > 0.7) {
          await prisma.tareaNota.create({
            data: {
              tareaId: tarea.id,
              creadoPorId: depto.gerente.id,
              contenido: "Nota de anexo: Revisar con cuidado los detalles.",
              createdAt: generarFechaAleatoria(fechaMinuta, FECHA_FIN)
            },
          });
        }

        totalTareas++;
      }
    }
  }

  console.log("✅ Seed completado con éxito");
  console.log(`📊 Minutas creadas: ${totalMinutas}`);
  console.log(`📊 Entradas organizacionales creadas: ${totalTareas}`);
}

main().catch((err) => {
  console.error("❌ Error en seed:", err);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
