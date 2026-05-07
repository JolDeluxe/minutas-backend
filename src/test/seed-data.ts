import { PrismaClient, Area, Linea, Clasificacion, Prioridad, EstadoTarea, EstadoAsignacion, EstadoMinuta, Rol } from "@prisma/client";

const prisma = new PrismaClient();

// ─── UTILIDADES Y DATOS ALEATORIOS ──────────────────────────────
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
// Se le agrega "!" para asegurarle a TypeScript que nunca devolverá undefined
const randomElement = <T>(arr: T[]): T => arr[randomInt(0, arr.length - 1)]!;

const generarFechaAleatoria = (inicio: Date, fin: Date) => {
  return new Date(inicio.getTime() + Math.random() * (fin.getTime() - inicio.getTime()));
};

// Fechas para la simulación: 1 de Febrero al día de hoy
const FECHA_INICIO = new Date("2026-02-01T08:00:00Z");
const FECHA_FIN = new Date(); // Hoy

const lineas = Object.values(Linea);
const areas = Object.values(Area);
const clasificaciones = Object.values(Clasificacion);
const prioridades = Object.values(Prioridad);

const verbos = ["Revisar", "Diseñar", "Analizar", "Corregir", "Investigar", "Preparar muestra de", "Aprobar", "Modificar"];
const objetos = ["suela de bota vaquera", "herraje para bolso", "patrón de chamarra de piel", "render de tienda", "caja de empaque", "logo para nueva línea", "horma de calzado", "política de calidad"];
const complementos = ["para la próxima temporada.", "urgente para el Sr. Cuadra.", "según comentarios de la última junta.", "para presentación con clientes.", "antes de pasarlo a producción.", "para la colección de invierno."];

const generarDescripcion = () => `${randomElement(verbos)} ${randomElement(objetos)} ${randomElement(complementos)}`;
const generarTituloMinuta = () => `Junta de Revisión - ${randomElement(["Avances", "Diseño", "Estrategia", "Producción"])} ${randomInt(100, 999)}`;

async function main() {
  console.log("🌱 Iniciando el sembrado de datos (Seeding)...");

  // 1. CREAR USUARIOS DE PRUEBA (Si no existen)
  console.log("👤 Generando usuarios de prueba...");
  const usuariosFalsos = [
    { nombre: "Gerente Diseño", username: "gerente_d", email: "gerente@empresa.com", rol: Rol.GERENCIA, area: Area.DISENO },
    { nombre: "Jefe Bota", username: "jefe_bota", email: "bota@empresa.com", rol: Rol.JEFE, area: Area.DISENO, linea: Linea.BOTA },
    { nombre: "Jefe Calzado", username: "jefe_calzado", email: "calzado@empresa.com", rol: Rol.JEFE, area: Area.DISENO, linea: Linea.CALZADO },
    { nombre: "Diseñador Ana", username: "ana_diseno", email: "ana@empresa.com", rol: Rol.COORDINADOR, area: Area.DISENO, linea: Linea.BOTA },
    { nombre: "Diseñador Juan", username: "juan_diseno", email: "juan@empresa.com", rol: Rol.COORDINADOR, area: Area.DISENO, linea: Linea.CALZADO },
    { nombre: "Diseñador Emma", username: "emma_diseno", email: "emma@empresa.com", rol: Rol.COORDINADOR, area: Area.DISENO, linea: Linea.ROPA },
  ];

  const usuariosCreados = [];
  for (const u of usuariosFalsos) {
    const user = await prisma.usuario.upsert({
      where: { username: u.username },
      update: {},
      create: {
        nombre: u.nombre,
        username: u.username,
        email: u.email,
        password: "password123", 
        rol: u.rol,
        area: u.area,
        linea: u.linea,
      }
    });
    usuariosCreados.push(user);
  }

  // Se agrega "!" al final para asegurarle a TS que encontraremos un usuario
  const creadorMinutas = (usuariosCreados.find(u => u.rol === Rol.GERENCIA) || usuariosCreados[0])!;
  const disenadores = usuariosCreados.filter(u => u.rol === Rol.COORDINADOR);

  // 2. CREAR MINUTAS (30 minutas distribuidas en los últimos meses)
  console.log("📝 Generando 30 minutas con sus tareas...");
  let totalTareasCreadas = 0;

  for (let i = 0; i < 30; i++) {
    const fechaMinuta = generarFechaAleatoria(FECHA_INICIO, FECHA_FIN);
    const cantidadTareas = randomInt(2, 12); 
    
    const esReciente = (FECHA_FIN.getTime() - fechaMinuta.getTime()) < (15 * 24 * 60 * 60 * 1000); 
    
    const minuta = await prisma.minuta.create({
      data: {
        titulo: generarTituloMinuta(),
        lineaDefault: randomElement(lineas),
        fecha: fechaMinuta,
        estado: esReciente ? EstadoMinuta.ACTIVA : EstadoMinuta.CERRADA,
        creadoPorId: creadorMinutas.id,
        createdAt: fechaMinuta,
      }
    });

    // 3. CREAR TAREAS PARA LA MINUTA
    for (let j = 0; j < cantidadTareas; j++) {
      const isExternal = Math.random() > 0.85; 
      const areaTarea = isExternal ? randomElement([Area.DIRECCION_MBC, Area.DIRECCION_CFI, Area.DIRECCION_ADJUNTA, Area.DIRECCION_TIENDAS]) : Area.DISENO;
      
      const diasParaVencer = randomInt(1, 15);
      const fechaVencimiento = new Date(fechaMinuta);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + diasParaVencer);

      // CORRECCIÓN: Tipado explícito para evitar error de TypeScript
      let estadoTarea: EstadoTarea = EstadoTarea.PENDIENTE;
      let fechaCompletado: Date | null = null;
      let fechaCerrado: Date | null = null;

      if (!esReciente || Math.random() > 0.3) {
        estadoTarea = randomElement([EstadoTarea.COMPLETADO, EstadoTarea.CERRADO, EstadoTarea.EN_PROGRESO]);
        
        if (estadoTarea === EstadoTarea.COMPLETADO || estadoTarea === EstadoTarea.CERRADO) {
          const aTiempo = Math.random() > 0.4; 
          
          fechaCompletado = new Date(fechaVencimiento);
          if (aTiempo) {
             fechaCompletado.setDate(fechaCompletado.getDate() - randomInt(1, 3)); 
          } else {
             fechaCompletado.setDate(fechaCompletado.getDate() + randomInt(1, 10)); 
          }

          if (estadoTarea === EstadoTarea.CERRADO) {
            fechaCerrado = new Date(fechaCompletado);
            fechaCerrado.setDate(fechaCerrado.getDate() + randomInt(1, 5)); 
          }
        }
      }

      if (isExternal && estadoTarea !== EstadoTarea.PENDIENTE) {
         estadoTarea = EstadoTarea.CERRADO;
         fechaCompletado = null;
         fechaCerrado = new Date(fechaMinuta);
         fechaCerrado.setDate(fechaCerrado.getDate() + randomInt(1, 5));
      }

      const tarea = await prisma.tarea.create({
        data: {
          descripcion: generarDescripcion(),
          area: areaTarea,
          prioridad: randomElement(prioridades),
          linea: randomElement(lineas),
          clasificacion: randomElement(clasificaciones),
          fechaVencimiento,
          estado: estadoTarea,
          completadoAt: fechaCompletado,
          cerradoAt: fechaCerrado,
          capturaCompleta: true, 
          isExternalArea: isExternal,
          minutaId: minuta.id,
          creadoPorId: creadorMinutas.id,
          createdAt: fechaMinuta,
        }
      });

      // 4. CREAR ASIGNACIONES (Solo si es interna)
      if (!isExternal) {
        const numAsignados = randomElement([1, 1, 2]); 
        const asignados = [...disenadores].sort(() => 0.5 - Math.random()).slice(0, numAsignados);

        for (const user of asignados) {
          // CORRECCIÓN: Tipado explícito
          let estadoAsig: EstadoAsignacion = EstadoAsignacion.PENDIENTE;
          let completadoAsig: Date | null = null;

          if (estadoTarea === EstadoTarea.COMPLETADO || estadoTarea === EstadoTarea.CERRADO) {
            estadoAsig = EstadoAsignacion.COMPLETADO;
            completadoAsig = fechaCompletado;
          } else if (estadoTarea === EstadoTarea.EN_PROGRESO) {
            estadoAsig = Math.random() > 0.5 ? EstadoAsignacion.EN_PROGRESO : EstadoAsignacion.PENDIENTE;
          }

          await prisma.tareaAsignacion.create({
            data: {
              tareaId: tarea.id,
              usuarioId: user.id,
              estado: estadoAsig,
              completadoAt: completadoAsig,
            }
          });
        }
      }

      totalTareasCreadas++;
    }
  }

  console.log("✅ ¡Proceso terminado con éxito!");
  console.log(`📊 Se crearon 30 minutas y un total de ${totalTareasCreadas} tareas.`);
}

main()
  .catch((e) => {
    console.error("❌ Error al popular la base de datos:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });