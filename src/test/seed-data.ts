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
import { addDays, setHours, setMinutes, isBefore, subDays, startOfWeek, addWeeks } from "date-fns";

const prisma = new PrismaClient();

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomElement = <T>(arr: T[]): T => arr[randomInt(0, arr.length - 1)]!;
const generarFechaAleatoria = (inicio: Date, fin: Date) => new Date(inicio.getTime() + Math.random() * (fin.getTime() - inicio.getTime()));

// Generar datos desde Enero 2026
const FECHA_INICIO = new Date("2026-01-01T09:00:00Z");
const FECHA_HOY = new Date(); // 25 de mayo 2026

// Catálogos extraídos de configuracion/controller.ts
const CATALOGOS = {
  DISENO: {
    lineas: ["CALZADO", "BOTA", "ROPA", "ACCESORIOS", "OTROS"],
    clasificaciones: ["IDEA", "INVESTIGACION", "CORRECCION", "ANALISIS", "MUESTRA", "POLITICAS", "OTROS"]
  },
  MARKETING: {
    lineas: ["MARKETING", "TIENDAS", "DIGITAL", "OTROS"],
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
    "Muestra de piel exótica retenida en aduana",
    "Revisión de prototipo de bolso de mano",
    "Prueba de durabilidad en hilos sintéticos"
  ],
  MARKETING: [
    "Planear pauta digital campaña Día de la Madre",
    "Diseñar renders para escaparates CDMX",
    "Investigar influencers para nueva colección",
    "Aprobar catálogo impreso otoño-invierno",
    "Coordinar sesión de fotos con modelos",
    "Revisar analytics de Instagram",
    "Ajustar material POP de tiendas",
    "Campaña de fidelización clientes VIP",
    "Estrategia de lanzamiento para línea de accesorios",
    "Redacción de artículos para el blog corporativo"
  ]
};

async function main() {
  console.log("🌱 Generando cronograma realista de minutas (Ene - May 2026)...");

  const usuariosDiseno = await prisma.usuario.findMany({ where: { departamento: Departamento.DISENO } });
  const usuariosMkt = await prisma.usuario.findMany({ where: { departamento: Departamento.MARKETING } });

  if (usuariosDiseno.length === 0 || usuariosMkt.length === 0) {
    throw new Error("Faltan usuarios. Por favor ejecuta primero `bun run src/test/seed-clean.ts` para resetear el ambiente.");
  }

  const gerenteDiseno = usuariosDiseno.find(u => u.rol === Rol.GERENCIA)!;
  const gerenteMkt = usuariosMkt.find(u => u.rol === Rol.GERENCIA)!;

  const responsablesDiseno = usuariosDiseno.filter(u => u.rol === Rol.COORDINADOR || u.rol === Rol.JEFE);
  const responsablesMkt = usuariosMkt.filter(u => u.rol === Rol.COORDINADOR || u.rol === Rol.JEFE);

  let totalTareas = 0;
  let totalMinutas = 0;

  const departamentosConfig = [
    { 
      nombre: Departamento.DISENO, 
      gerente: gerenteDiseno, 
      responsables: responsablesDiseno,
      diaSemana: 2, // Martes
      prefijo: "Diseño y Desarrollo"
    },
    { 
      nombre: Departamento.MARKETING, 
      gerente: gerenteMkt, 
      responsables: responsablesMkt,
      diaSemana: 3, // Miércoles
      prefijo: "Estrategia Marketing"
    }
  ];

  for (const config of departamentosConfig) {
    console.log(`\n📦 Generando timeline para ${config.nombre}...`);
    
    // Empezar desde la primera semana de enero
    let fechaActual = startOfWeek(FECHA_INICIO);
    fechaActual = addDays(fechaActual, config.diaSemana); // Mover al día de la semana correspondiente
    fechaActual = setHours(fechaActual, 10); // 10:00 AM
    fechaActual = setMinutes(fechaActual, 0);

    const cats = CATALOGOS[config.nombre];

    while (isBefore(fechaActual, addDays(FECHA_HOY, 7))) {
      const isFuture = !isBefore(fechaActual, FECHA_HOY);
      const isVeryRecent = !isBefore(fechaActual, subDays(FECHA_HOY, 7));
      
      let estadoMinuta: EstadoMinuta = EstadoMinuta.CERRADA;
      if (isFuture) {
        estadoMinuta = EstadoMinuta.PROGRAMADA;
      } else if (isVeryRecent) {
        // La última o penúltima puede estar activa o en organización
        estadoMinuta = Math.random() > 0.5 ? EstadoMinuta.ACTIVA : EstadoMinuta.EN_ORGANIZACION;
      }

      const minuta = await prisma.minuta.create({
        data: {
          titulo: `${config.prefijo} - Sem ${totalMinutas + 1}`,
          lineaDefault: randomElement(cats.lineas),
          departamento: config.nombre,
          estado: estadoMinuta,
          fechaProgramada: fechaActual,
          fechaRealizada: isFuture ? null : fechaActual,
          createdAt: subDays(fechaActual, 2), // Creada 2 días antes
          creadoPorId: config.gerente.id,
          cerradoPorId: estadoMinuta === EstadoMinuta.CERRADA ? config.gerente.id : null,
          cerradoAt: estadoMinuta === EstadoMinuta.CERRADA ? addDays(fechaActual, 1) : null,
        },
      });
      totalMinutas++;

      if (!isFuture) {
        // Notas rápidas (Post-its)
        const numNotas = randomInt(1, 4);
        for (let n = 0; n < numNotas; n++) {
          await prisma.notaGeneral.create({
            data: {
              minutaId: minuta.id,
              creadoPorId: config.gerente.id,
              contenido: `Nota importante de la sesión: ${randomElement(["Revisar presupuesto", "Confirmar con planta", "Pendiente de firma", "Urgente enviar correo"])}`,
              createdAt: fechaActual
            }
          });
        }

        // Entradas (Tareas, Recordatorios, etc)
        const numEntradas = randomInt(5, 12);
        for (let j = 0; j < numEntradas; j++) {
          const randTipo = Math.random();
          let tipo: TipoEntrada = TipoEntrada.TAREA;
          if (randTipo > 0.92) tipo = TipoEntrada.DESCARTADA;
          else if (randTipo > 0.85) tipo = TipoEntrada.POLITICA;
          else if (randTipo > 0.75) tipo = TipoEntrada.RECORDATORIO;

          const fechaVenc = addDays(fechaActual, randomInt(3, 21));
          
          let estadoTarea: EstadoTarea | null = null;
          let prioridad: Prioridad | null = null;
          let completadoAt: Date | null = null;
          let cerradoAt: Date | null = null;
          let alcanceRecordatorio: AlcanceRecordatorio | null = null;

          if (tipo === TipoEntrada.TAREA) {
            prioridad = randomElement(prioridades);
            
            if (estadoMinuta === EstadoMinuta.CERRADA) {
              // En minutas cerradas, la mayoría de tareas están cerradas
              const r = Math.random();
              if (r > 0.1) estadoTarea = EstadoTarea.CERRADA;
              else if (r > 0.05) estadoTarea = EstadoTarea.EN_REVISION;
              else estadoTarea = EstadoTarea.PENDIENTE;
            } else {
              // En minutas activas, hay más pendientes
              const r = Math.random();
              if (r > 0.7) estadoTarea = EstadoTarea.CERRADA;
              else if (r > 0.4) estadoTarea = EstadoTarea.EN_REVISION;
              else estadoTarea = EstadoTarea.PENDIENTE;
            }

            if (estadoTarea === EstadoTarea.CERRADA || estadoTarea === EstadoTarea.EN_REVISION) {
              completadoAt = generarFechaAleatoria(fechaActual, fechaVenc < FECHA_HOY ? fechaVenc : FECHA_HOY);
            }
            if (estadoTarea === EstadoTarea.CERRADA) {
              cerradoAt = addDays(completadoAt!, 1);
            }
          } else if (tipo === TipoEntrada.RECORDATORIO) {
            alcanceRecordatorio = Math.random() > 0.4 ? AlcanceRecordatorio.DEPARTAMENTO : AlcanceRecordatorio.PERSONAL;
          }

          const tarea = await prisma.tarea.create({
            data: {
              descripcion: randomElement(descripciones[config.nombre]),
              departamento: config.nombre,
              area: config.nombre === Departamento.DISENO ? Area.DISENO : Area.MARKETING,
              linea: randomElement(cats.lineas),
              clasificacion: tipo === TipoEntrada.POLITICA ? "POLITICAS" : randomElement(cats.clasificaciones),
              tipo,
              estado: estadoTarea,
              prioridad,
              alcanceRecordatorio,
              fechaVencimiento: tipo === TipoEntrada.TAREA ? fechaVenc : null,
              minutaId: minuta.id,
              creadoPorId: config.gerente.id,
              organizadoPorId: config.gerente.id,
              organizadoAt: fechaActual,
              completadoAt,
              cerradoAt,
              createdAt: fechaActual,
            }
          });

          // Asignaciones
          if (tipo === TipoEntrada.TAREA || (tipo === TipoEntrada.RECORDATORIO && alcanceRecordatorio === AlcanceRecordatorio.PERSONAL)) {
            const numAsignados = randomInt(1, config.responsables.length > 2 ? 2 : 1);
            const elegidos = [...config.responsables].sort(() => 0.5 - Math.random()).slice(0, numAsignados);
            for (const resp of elegidos) {
              await prisma.tareaAsignacion.create({
                data: {
                  tareaId: tarea.id,
                  usuarioId: resp.id,
                  asignadoPorId: config.gerente.id
                }
              });
            }
          }

          // Historial básico para simular actividad
          if (estadoTarea === EstadoTarea.CERRADA) {
             await prisma.tareaHistorial.create({
               data: {
                 tareaId: tarea.id,
                 usuarioId: config.gerente.id,
                 campo: "estado",
                 valorAntes: "EN_REVISION",
                 valorDespues: "CERRADA",
                 tipo: "CAMBIO_ESTADO",
                 createdAt: cerradoAt!
               }
             });
          }

          totalTareas++;
        }
      }

      // Siguiente semana
      fechaActual = addWeeks(fechaActual, 1);
    }
  }

  console.log("\n✨ Población completada con éxito");
  console.log(`📅 Rango: Enero 2026 - Mayo 2026`);
  console.log(`📊 Minutas creadas: ${totalMinutas}`);
  console.log(`📊 Entradas totales: ${totalTareas}`);
}

main().catch((err) => {
  console.error("❌ Error en seeding:", err);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
